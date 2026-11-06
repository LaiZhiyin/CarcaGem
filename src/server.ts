import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'node:crypto';
import { installAnalytics } from './analytics/http.js';
import type { VisitorContext } from './analytics/model.js';
import { VERSION } from './version.js';
import { Game } from './engine/game.js';
import { GAME_AI_OPTIONS } from './engine/ai/config.js';
import { AI_TURN_TIMING, paceAiDecision, waitForAiDelay } from './engine/ai/pacing.js';
import { botDecision } from './botPool.js';
import { decide } from './engine/ai/strategy.js';
import type { OnlineAction } from './engine/gameRuntime.js';
import { applyOnlineAction } from './engine/onlineGame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

if (!process.env.ANALYTICS_DATA_PATH) {
  process.env.ANALYTICS_DATA_PATH ||= './data';
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

interface RoomState {
  members: Record<string, Record<string, any>>;
  analyticsId: string;
  gameId?: string;
  context: VisitorContext;
  contexts: Record<string, VisitorContext | null>;
  hostUserId: string;
  playerOrder: string[];
  joinedCounter: number;
  game?: Game;
  botTask?: AbortController;
  botResumeAt?: number;
  revision?: number;
}
const rooms: Record<string, RoomState> = Object.create(null);
let analyticsWriteErrors = 0;
const analytics = installAnalytics(app, () => ({
  rooms: Object.values(rooms).filter(r => r.context.environment === 'production').length,
  humanSeats: Object.values(rooms).filter(r => r.context.environment === 'production').reduce((n,r) => n+Object.values(r.members).filter(m=>!m.isAI).length,0),
  aiSeats: Object.values(rooms).filter(r => r.context.environment === 'production').reduce((n,r) => n+Object.values(r.members).filter(m=>m.isAI).length,0),
  serverVersion: VERSION, analyticsWriteErrors,
}));
app.use(express.static(path.join(__dirname, '../dist')));
const recordStats = (write: () => void) => { try { analytics.store.db.transaction(write)(); } catch (error) { analyticsWriteErrors++; console.error('Analytics write failed:', error instanceof Error ? error.message : 'unknown'); } };

const sendRoomPresence = (roomCode: string) => {
  const room = rooms[roomCode];
  if (room) {
    recordStats(() => analytics.store.db.prepare('UPDATE rooms SET humans=MAX(humans,?) WHERE id=?').run(Object.values(room.members).filter(m=>!m.isAI).length, room.analyticsId));
    io.to(roomCode).emit('presence-sync', Object.values(room.members));
  }
};

const isValidPlayerData = (value: any): value is { userId: string; displayName: string; isHost?: boolean; ready?: boolean } =>
  Boolean(value && typeof value.userId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value.userId) &&
    typeof value.displayName === 'string' && value.displayName.trim().length > 0 && value.displayName.length <= 32);

const botColors = [ ['red','#e74c3c'], ['yellow','#f1c40f'], ['green','#2ecc71'], ['blue','#3498db'] ];
const animals=['1-nemo','2-shelly','3-sunny','4-ray','5-ollie','6-moby','7-pinchy','8-skippy','9-twinkle','10-nori'];
function scheduleBot(code:string) {
  const room=rooms[code],game=room?.game;
  if(!game || room.botTask || game.state!=='PLACE_TILE' || !game.playerManager.getCurrentPlayer().isAI)return;
  const task=new AbortController();room.botTask=task;
  const revision=room.revision, snapshot=game.publicSnapshot();
  const bot=game.playerManager.getCurrentPlayer();
  const finish=(result:ReturnType<typeof decide>)=>{
    if(task.signal.aborted || rooms[code]!==room || room.revision!==revision || game.state!=='PLACE_TILE')return;
    const move=result.move;if(!move)return;
    const emit=(action:OnlineAction)=>{
      if(!applyOnlineAction(game,action,bot.userId!))throw new Error('Rejected bot action');
      io.to(code).emit('game-event',{type:'ACTION',payload:action});
    };
    for(let i=0;i<4 && game.currentRotation!==move.rotation;i++)emit({by:bot.userId!,action:'ROTATE'});
    emit({by:bot.userId!,action:'TENTATIVE_PLACE',data:{x:move.x,y:move.y}});
    if(move.region)emit({by:bot.userId!,action:'PLACE_MEEPLE',data:{regionId:move.region}});
    else emit({by:bot.userId!,action:'SKIP_MEEPLE'});
    room.revision=(room.revision??0)+1;
  };
  const run = async () => {
    const pause = Math.max(AI_TURN_TIMING.startDelayMs, (room.botResumeAt ?? 0) - Date.now());
    if (!await waitForAiDelay(pause, task.signal) || rooms[code] !== room || room.revision !== revision) return;
    const decision = botDecision(snapshot, GAME_AI_OPTIONS, task.signal)
      .catch(error => { if (task.signal.aborted) throw error; return decide(snapshot, { ...GAME_AI_OPTIONS, budgetMs: 0 }); });
    const result = await paceAiDecision(decision, task.signal);
    if (result) finish(result);
  };
  void run().catch(error => { if (!task.signal.aborted) console.error('Bot turn:', error); })
    .finally(() => {
      if (room.botTask === task) room.botTask = undefined;
      if (rooms[code] === room && !task.signal.aborted) scheduleBot(code);
    });
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  const browserContext = analytics.resolveToken(socket.handshake.auth?.analyticsToken);
  const serverContext = { ...(browserContext || analytics.fallbackContext()), version: VERSION };

  socket.on('join-room', (roomCode, playerData, callback) => {
    const fail = (error: string, reason = 'invalid_request') => { recordStats(() => analytics.store.serverEvent(serverContext, playerData?.isHost ? 'room_create_failed' : 'room_join_failed', { props: { reason } })); if (typeof callback === 'function') callback({ error }); };
    if (typeof roomCode !== 'string' || !/^\d{5}$/.test(roomCode) || !isValidPlayerData(playerData)) {
      fail('Invalid room information.');
      return;
    }
    const existingRoom = rooms[roomCode];
    if (!existingRoom) {
      if (!playerData.isHost) { fail('Invalid invite code. Please try again.', 'invalid_code'); return; }
      rooms[roomCode] = {
        members: Object.create(null), hostUserId: playerData.userId, playerOrder: [], joinedCounter: 0,
        analyticsId: 'room_' + randomUUID(), context: serverContext, contexts: Object.create(null),
      };
    } else {
      if (existingRoom.playerOrder.length) { fail('The game has already started.', 'already_started'); return; }
      if (playerData.isHost) { fail('That invite code is already in use.'); return; }
      if (Object.keys(existingRoom.members).length >= 3) { fail('The room is full.', 'room_full'); return; }
      if (existingRoom.members[playerData.userId]) { fail('That player is already in the room.'); return; }
    }

    const room = rooms[roomCode];
    room.contexts[playerData.userId] = browserContext;
    if (!existingRoom) recordStats(() => {
      analytics.store.db.prepare('INSERT OR IGNORE INTO rooms(id,env,version,created) VALUES (?,?,?,?)').run(room.analyticsId, room.context.environment, VERSION, Date.now());
      analytics.store.serverEvent(serverContext, 'room_created', { roomId: room.analyticsId });
    });
    recordStats(() => analytics.store.serverEvent(serverContext, 'room_joined', { roomId: room.analyticsId, props: {kind:existingRoom?'join':'create'} }));
    socket.join(roomCode);
    room.members[playerData.userId] = {
      userId: playerData.userId,
      displayName: playerData.displayName.trim(),
      ready: Boolean(playerData.ready),
      isHost: playerData.userId === room.hostUserId,
      socketId: socket.id,
      joinedAt: room.joinedCounter++,
    };
    sendRoomPresence(roomCode);
    console.log(`User ${playerData.userId} joined room ${roomCode}`);
    if (typeof callback === 'function') callback({ success: true, roomId: room.analyticsId });
  });

  socket.on('update-presence', (roomCode, userId, partialData) => {
    const room = rooms[roomCode];
    const member = room?.members[userId];
    if (!room || !member || member.socketId !== socket.id || room.playerOrder.length || !partialData || typeof partialData !== 'object') return;
    const allowed = ['displayName', 'ready', 'color', 'colorKey', 'avatarImg'];
    const safePatch: Record<string, unknown> = {};
    for (const key of allowed) if (key in partialData) safePatch[key] = partialData[key];
    if ('displayName' in safePatch && (typeof safePatch.displayName !== 'string' || !safePatch.displayName.trim())) return;
    if (typeof safePatch.displayName === 'string') safePatch.displayName = safePatch.displayName.trim().slice(0, 32);
    if ('ready' in safePatch && typeof safePatch.ready !== 'boolean') return;
    if ('colorKey' in safePatch && !['red', 'yellow', 'green', 'blue'].includes(String(safePatch.colorKey))) return;
    if ('colorKey' in safePatch && Object.values(room.members).some(other => other !== member && other.colorKey === safePatch.colorKey)) {
      sendRoomPresence(roomCode); return;
    }
    if ('color' in safePatch && !['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'].includes(String(safePatch.color))) return;
    if ('avatarImg' in safePatch && (typeof safePatch.avatarImg !== 'string' || !/^\/workers\/\d+-[a-z]+-(red|yellow|green|blue)\.png(?:\?v=[\w.-]+)?$/.test(safePatch.avatarImg))) return;
    if(typeof safePatch.avatarImg==='string' && Object.values(room.members).some(other=>other!==member && other.avatarImg?.match(/\/workers\/(\d+-[a-z]+)-/)?.[1]===safePatch.avatarImg!.toString().match(/\/workers\/(\d+-[a-z]+)-/)?.[1]))return;
    Object.assign(member, safePatch);
    if ('ready' in safePatch) recordStats(() => analytics.store.serverEvent(serverContext, 'room_ready_changed', { roomId: room.analyticsId }));
    sendRoomPresence(roomCode);
  });

  socket.on('configure-bot', (code, command, callback) => {
    const room=rooms[code],host=room?.members[room.hostUserId];
    const reply=(error?:string)=>{if(typeof callback==='function')callback(error?{error}:{success:true});};
    if(!room || host?.socketId!==socket.id || room.playerOrder.length || !command || typeof command!=='object'){reply('Could not update the AI seat.');return;}
    if(command.action==='remove') {
      if(!room.members[command.userId]?.isAI){reply('AI player not found.');return;}
      delete room.members[command.userId];
    } else if(command.action==='add') {
      if(Object.keys(room.members).length>=3){reply('The room is full.');return;}
      const color=botColors.find(([key])=>!Object.values(room.members).some(m=>m.colorKey===key));
      const animal=animals.find(a=>!Object.values(room.members).some(m=>m.avatarImg?.includes('/'+a+'-')));
      if(!color || !animal){reply('No available avatar or color.');return;}
      const userId='bot-'+room.joinedCounter;
      room.members[userId]={userId,displayName:animal.split('-')[1].replace(/^./, letter => letter.toUpperCase()),isAI:true,ready:true,colorKey:color[0],color:color[1],avatarImg:'/workers/'+animal+'-'+color[0]+'.png?v=1.0.4',joinedAt:room.joinedCounter++};
    } else {reply('Invalid operation.');return;}
    recordStats(() => analytics.store.serverEvent(serverContext, 'bot_seat_changed', { roomId: room.analyticsId, props: { reason: command.action } }));
    sendRoomPresence(code);reply();
  });

  socket.on('broadcast-event', (roomCode, event) => {
    const room = rooms[roomCode];
    if (!room || !event || typeof event !== 'object') return;
    const member = Object.values(room.members).find((candidate: any) => candidate.socketId === socket.id);
    if (!member) return;

    if (event.type === 'GAME_START') {
      if (room.playerOrder.length || member.userId !== room.hostUserId || !Array.isArray(event.payload?.players) || !Number.isInteger(event.payload.seed)) return;
      const players = event.payload.players as { userId: string; colorKey: string; avatarImg?: string }[];
      const ids = players.map(player => player?.userId);
      if (players.length < 2 || players.length > 3 || new Set(ids).size !== ids.length ||
          ids.some((id: unknown) => typeof id !== 'string' || !room.members[id]) ||
          ids.length !== Object.keys(room.members).length ||
          Object.values(room.members).some(player => !player.isHost && !player.ready) ||
          new Set(players.map(player => player.colorKey)).size !== players.length ||
          players.some(player => !['red', 'yellow', 'green', 'blue'].includes(player.colorKey) || room.members[player.userId].colorKey !== player.colorKey)) return;
      room.playerOrder = ids;
      room.game = new Game(players.map(player => ({
        userId: player.userId,
        name: room.members[player.userId].displayName,
        color: room.members[player.userId].color || '',
        isAI: Boolean(room.members[player.userId].isAI),
        meepleImg: '',
        avatarImg: player.avatarImg || '',
      })), event.payload.seed);
      // The local game pauses for the treasure modal; online bots observe the same pause.
      room.game.onShowModal = config => {
        const modalDuration = Math.ceil((config.autoCloseTimer ?? 0) / 1000) * 1000;
        room.botResumeAt = Math.max(room.botResumeAt ?? 0, Date.now() + modalDuration);
      };
      room.game.start();
      room.gameId = 'online_' + randomUUID();
      const gameId = room.gameId;
      recordStats(() => analytics.store.startOnline(gameId, room.analyticsId, room.context, room.playerOrder.map(id => ({ visitor: room.contexts[id]?.visitorId || null, ai: Boolean(room.members[id].isAI) }))));
      room.game.onTelemetry = telemetry => recordStats(() => {
        if (telemetry.name === 'turn_committed') analytics.store.turn(gameId, telemetry.turnId!, telemetry.seat!);
        if (telemetry.name === 'game_finished') analytics.store.finish(gameId, Date.now(), telemetry.reason);
        const user = telemetry.seat ? room.playerOrder[telemetry.seat-1] : room.hostUserId;
        const actor = { ...(room.contexts[user] || room.context), version: VERSION };
        analytics.store.serverEvent(actor, telemetry.name, { gameId, roomId: room.analyticsId, props: { ...telemetry, kind: telemetry.isAI ? 'ai' : 'human' } });
      });
      event.payload.gameId = gameId;
      event.payload.roomId = room.analyticsId;
    } else if (event.type === 'ACTION') {
      if (!room.game || !applyOnlineAction(room.game, event.payload, member.userId)) return;
    } else {
      return;
    }
    room.revision=(room.revision??0)+1;
    if(event.type==='GAME_START') {
      event.payload.players=room.playerOrder.map(id=>({...room.members[id],socketId:undefined}));
      io.to(roomCode).emit('game-event',event);
    } else socket.to(roomCode).emit('game-event', event);
    scheduleBot(roomCode);
  });

  socket.on('disconnecting', () => {
    for (const roomCode of socket.rooms) {
      if (rooms[roomCode]) {
        const userId = Object.keys(rooms[roomCode].members).find(
          id => rooms[roomCode].members[id].socketId === socket.id
        );
        if (userId) {
          const room = rooms[roomCode];
          const wasHost = room.hostUserId === userId;
          recordStats(() => analytics.store.serverEvent(serverContext, 'participant_disconnected', { gameId: room.gameId, roomId: room.analyticsId, props: { reason: wasHost ? 'host_left' : 'participant_left' } }));
          delete rooms[roomCode].members[userId];
          if (wasHost || Object.keys(rooms[roomCode].members).length === 0) {
            recordStats(() => { analytics.store.db.prepare('UPDATE rooms SET closed=?,reason=? WHERE id=?').run(Date.now(), wasHost ? 'host_left' : 'empty', room.analyticsId); if (room.gameId) analytics.store.interrupt(room.gameId, wasHost ? 'host_left' : 'room_empty'); analytics.store.serverEvent(serverContext, 'room_closed', { gameId: room.gameId, roomId: room.analyticsId, props: { reason: wasHost ? 'host_left' : 'empty' } }); });
            io.to(roomCode).emit('presence-sync', []);
            rooms[roomCode].botTask?.abort();
            delete rooms[roomCode];
          } else {
            sendRoomPresence(roomCode);
          }
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.use('/api', (_, res) => res.status(404).json({ error: 'API not found' }));

// SPA fallback
app.use((_, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`LAN URL: http://<local-address>:${PORT}`);
  console.log(`Analytics database: ${analytics.store.filename}`);
});

process.on('SIGTERM', () => {
  for (const room of Object.values(rooms)) if (room.gameId) recordStats(() => analytics.store.interrupt(room.gameId!, 'service_restart'));
  analytics.store.close(); process.exit(0);
});
