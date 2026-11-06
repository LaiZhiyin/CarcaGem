// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { Game } from './src/engine/game';
import type { GameRuntime, OnlineAction } from './src/engine/gameRuntime';
import { isValidPlacement } from './src/engine/validator';
import { applyOnlineAction } from './src/engine/onlineGame';
import { AI_TURN_TIMING } from './src/engine/ai/pacing';

const configs = [
  { userId: 'player-a', name: 'A', color: '#e74c3c', isAI: false, meepleImg: '', avatarImg: '' },
  { userId: 'player-b', name: 'B', color: '#f1c40f', isAI: false, meepleImg: '', avatarImg: '' },
];
let server: ChildProcess;
let serverUrl: string;
const dataPath = mkdtempSync(join(tmpdir(), 'carcagem-online-test-'));

beforeAll(async () => {
  if (process.env.CARCAGEM_TEST_SERVER_URL) {
    serverUrl = process.env.CARCAGEM_TEST_SERVER_URL;
    return;
  }
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  serverUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [process.env.CARCAGEM_TEST_SERVER || 'dist-server/server.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ANALYTICS_DATA_PATH: dataPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${output}`)), 5000);
    server.stdout!.on('data', chunk => {
      output += chunk;
      if (output.includes('Server running on 127.0.0.1:')) { clearTimeout(timer); resolve(); }
    });
    server.stderr!.on('data', chunk => { output += chunk; });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
});

afterAll(async () => {
  if (server && server.exitCode === null) {
    await new Promise<void>(resolve => { server.once('exit', () => resolve()); server.kill(); });
  }
  rmSync(dataPath, { recursive: true, force: true });
});

function snapshot(game: Game) {
  return {
    board: game.board.getSerializedTiles(),
    players: game.playerManager.players,
    currentIndex: game.playerManager.currentIndex,
    extraTurns: game.playerManager.extraTurns,
    deck: game.deck,
    currentTile: game.currentTile,
    currentRotation: game.currentRotation,
    state: game.state,
    pending: [game.pendingX, game.pendingY],
  };
}

function placeNext(game: Game) {
  for (const slot of game.board.getAvailableSlots()) {
    for (const rotation of [0, 90, 180, 270]) {
      if (!isValidPlacement(game.board, slot.x, slot.y, game.currentTile!, rotation)) continue;
      while (game.currentRotation !== rotation) game.rotateTile();
      expect(game.tentativePlace(slot.x, slot.y)).toBe(true);
      return;
    }
  }
  throw new Error('No valid placement');
}

async function setupRoom(roomCode: string) {
  const sockets = configs.map(() => io(serverUrl, { transports: ['websocket'], reconnection: false }));
  await Promise.all(sockets.map(socket => new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve); socket.once('connect_error', reject);
  })));
  try {
    let members: { ready?: boolean; colorKey?: string }[] = [];
    sockets[0].on('presence-sync', next => { members = next; });
    for (const [i, socket] of sockets.entries()) {
      await new Promise<void>((resolve, reject) => socket.emit('join-room', roomCode, {
        userId: configs[i].userId, displayName: configs[i].name, isHost: i === 0,
      }, (response: { error?: string }) => response.error ? reject(new Error(response.error)) : resolve()));
      socket.emit('update-presence', roomCode, configs[i].userId, {
        colorKey: i === 0 ? 'red' : 'yellow', color: configs[i].color, ready: true,
      });
    }
    await vi.waitFor(() => expect(members.filter(m => m.ready && m.colorKey)).toHaveLength(2), { timeout: 5000 });
    let started = false;
    sockets[1].once('game-event', event => { if (event.type === 'GAME_START') started = true; });
    // Seed 17526 draws a road endpoint, gem straight road and endpoint: a real closed gem feature.
    sockets[0].emit('broadcast-event', roomCode, { type: 'GAME_START', payload: {
      seed: 17526, players: configs.map((p, i) => ({ userId: p.userId, colorKey: i === 0 ? 'red' : 'yellow' })),
    }});
    await vi.waitFor(() => expect(started).toBe(true), { timeout: 5000 });
    const games = sockets.map((socket, i) => {
      const runtime: GameRuntime = {
        localUserId: () => configs[i].userId,
        onAction: handler => { socket.on('game-event', event => { if (event.type === 'ACTION') handler(event.payload); }); },
        sendAction: payload => { socket.emit('broadcast-event', roomCode, { type: 'ACTION', payload }); },
        playSound: () => {},
      };
      const game = new Game(configs, 17526, runtime);
      game.start();
      return game;
    });
    return { sockets, games };
  } catch (error) { sockets.forEach(socket => socket.disconnect()); throw error; }
}

async function expectSynced(games: Game[], tileCount: number, player: string) {
  await vi.waitFor(() => {
    expect(games[0].board.getAllTiles()).toHaveLength(tileCount);
    expect(games[1].board.getAllTiles()).toHaveLength(tileCount);
    expect(games[0].playerManager.getCurrentPlayer().userId).toBe(player);
    expect(snapshot(games[1])).toEqual(snapshot(games[0]));
  }, { timeout: 3000 });
}

describe('real Socket.IO treasure bonus turns', () => {
  it.each(['skip', 'place'] as const)('syncs the bonus turn and following player when ending with %s', async (ending) => {
    const { sockets, games } = await setupRoom(ending === 'skip' ? '16161' : '16162');
    const [a, b] = games;
    try {
      expect(a.currentTile?.id).toBe(1);
      while (a.currentRotation !== 270) a.rotateTile();
      expect(a.tentativePlace(-1, 0)).toBe(true);
      a.skipMeeple();
      await expectSynced(games, 2, 'player-b');
      expect(b.currentTile?.id).toBe(23);
      expect(b.tentativePlace(1, 0)).toBe(true);
      expect(b.placeMeeple('road-0')).toBe(true);
      await expectSynced(games, 3, 'player-a');
      while (a.currentRotation !== 90) a.rotateTile();
      expect(a.tentativePlace(2, 0)).toBe(true);
      a.skipMeeple();
      await expectSynced(games, 4, 'player-b');
      expect(b.playerManager.extraTurns[2]).toBe(1);
      // Finish B's ordinary turn: the gem reward retains B as the active player.
      placeNext(b); b.skipMeeple();
      await expectSynced(games, 5, 'player-b');
      expect(b.playerManager.extraTurns[2]).toBe(0);
      // This action was rejected by the old server's fixed turn increment.
      placeNext(b);
      if (ending === 'place') {
        const region = b.getAvailableMeepleRegions()[0];
        expect(region).toBeTruthy();
        expect(b.placeMeeple(region)).toBe(true);
      } else b.skipMeeple();
      await expectSynced(games, 6, 'player-a');
      placeNext(a); a.skipMeeple();
      await expectSynced(games, 7, 'player-b');
    } finally { sockets.forEach((socket: Socket) => socket.disconnect()); }
  }, 15000);

  it('rejects out-of-turn, forged and invalid actions without advancing the authoritative game', () => {
    const game = new Game(configs, 17526); game.start();
    const before = JSON.stringify(snapshot(game));
    for (const action of [
      { by: 'player-b', action: 'ROTATE' },
      { by: 'player-b', action: 'SKIP_MEEPLE' },
      { by: 'player-a', action: 'SKIP_MEEPLE' },
      { by: 'player-a', action: 'TENTATIVE_PLACE', data: { x: 50, y: 50 } },
      { by: 'player-a', action: 'PLACE_MEEPLE', data: { regionId: 'missing' } },
    ]) expect(applyOnlineAction(game, action as OnlineAction, 'player-a')).toBe(false);
    expect(JSON.stringify(snapshot(game))).toBe(before);
  });
});

describe('server-owned robot seats',()=>{
 it('adds bots only for host, broadcasts robot moves to host, and removes an unused seat',async()=>{
  const socket=io(serverUrl,{transports:['websocket'],reconnection:false});
  await new Promise<void>(resolve=>socket.once('connect',resolve));
  try {
   const call=(name:string,...args:unknown[])=>new Promise<{error?:string}>(resolve=>socket.emit(name,...args,resolve));
   let members:any[]=[];
   const actions: { action: string; at: number }[] = [];
   socket.on('presence-sync',next=>{members=next;});
   socket.on('game-event',event=>{if(event.type==='ACTION')actions.push({ action: event.payload.action, at: Date.now() });});
   await call('join-room','16163',{userId:'bot-host',displayName:'Host',isHost:true});
   socket.emit('update-presence','16163','bot-host',{colorKey:'blue',color:'#3498db',ready:true});
   expect((await call('configure-bot','16163',{action:'add'})).error).toBeUndefined();
   await vi.waitFor(()=>expect(members).toHaveLength(2));
   const bot=members.find(m=>m.isAI);
   expect(bot.userId).toMatch(/^bot-/);expect(bot.colorKey).not.toBe('blue');
   expect((await call('configure-bot','16163',{action:'add',difficulty:'normal'})).error).toBeUndefined();
   await vi.waitFor(()=>expect(members).toHaveLength(3));
   const extra=members.find(m=>m.isAI&&m.userId!==bot.userId);
   expect(extra).not.toHaveProperty('aiDifficulty');
   await call('configure-bot','16163',{action:'remove',userId:extra.userId});
   await vi.waitFor(()=>expect(members).toHaveLength(2));
   const ordered=[bot,members.find(m=>!m.isAI)];
   const startedAt = Date.now();
   socket.emit('broadcast-event','16163',{type:'GAME_START',payload:{seed:17526,players:ordered,hostId:'bot-host'}});
   await vi.waitFor(()=>expect(actions.some(action => ['PLACE_MEEPLE', 'SKIP_MEEPLE'].includes(action.action))).toBe(true),{timeout:6000});
   expect(actions[0].at - startedAt).toBeGreaterThanOrEqual(AI_TURN_TIMING.startDelayMs + AI_TURN_TIMING.minimumThinkingMs - 20);
  }finally{socket.disconnect();}
 });
});
