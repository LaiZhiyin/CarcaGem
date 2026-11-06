import Database from 'better-sqlite3';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CLIENT_EVENTS, DAY, METRIC_VERSION, SCREENS, SESSION_GAP, idIsValid } from './model.js';
import type { AnalyticsEvent, VisitorContext } from './model.js';

export class AnalyticsStore {
  db: Database.Database;
  filename: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.filename = path.join(directory, 'analytics-v2.db');
    this.db = new Database(this.filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 1500');
    const backfillVersions=!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_versions'").get();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS visitors(id TEXT, env TEXT, first_seen INTEGER, kind TEXT, device TEXT, browser TEXT, version TEXT, source TEXT, medium TEXT, campaign TEXT, content TEXT, campaign_id TEXT, PRIMARY KEY(id,env));
      CREATE TABLE IF NOT EXISTS app_versions(version TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, visitor TEXT, env TEXT, started INTEGER, last_seen INTEGER, source TEXT, medium TEXT, campaign TEXT);
      CREATE TABLE IF NOT EXISTS touches(id TEXT PRIMARY KEY,visitor TEXT,env TEXT,at INTEGER,source TEXT,medium TEXT,campaign TEXT,content TEXT,campaign_id TEXT);
      CREATE INDEX IF NOT EXISTS touches_visitor ON touches(visitor,env,at);
      CREATE INDEX IF NOT EXISTS sessions_visitor ON sessions(visitor,env,started,last_seen);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, name TEXT, at INTEGER, received INTEGER, visitor TEXT, session TEXT, env TEXT, source_type TEXT, version TEXT, device TEXT, browser TEXT, screen TEXT, game_id TEXT, room_id TEXT, page_id TEXT, navigation_id TEXT, props TEXT);
      CREATE INDEX IF NOT EXISTS events_time ON events(env,at,name);
      CREATE INDEX IF NOT EXISTS events_visitor ON events(visitor,env,at);
      CREATE INDEX IF NOT EXISTS events_names ON events(env,name,at);
      CREATE INDEX IF NOT EXISTS events_journeys ON events(env,name,at,session,visitor,screen,game_id,room_id,version,received) WHERE name IN ('screen_view','game_started','game_viewed','room_created','room_joined');
      CREATE INDEX IF NOT EXISTS events_page_visitor ON events(visitor,env,at,version) WHERE name='screen_view';
      CREATE INDEX IF NOT EXISTS events_business ON events(name,game_id) WHERE name IN ('turn_committed','game_finished');
      CREATE INDEX IF NOT EXISTS events_page_time ON events(env,at,visitor,device,browser,version,session,screen,id) WHERE name='screen_view';
      CREATE INDEX IF NOT EXISTS events_views ON events(session,at,received,id) WHERE name='screen_view';
      CREATE INDEX IF NOT EXISTS events_session ON events(session,name,screen,at);
      CREATE INDEX IF NOT EXISTS events_game ON events(game_id,name);
      CREATE UNIQUE INDEX IF NOT EXISTS page_navigation ON events(visitor,page_id,navigation_id) WHERE name='screen_view';
      CREATE TABLE IF NOT EXISTS intervals(id TEXT PRIMARY KEY, visitor TEXT, env TEXT, session TEXT, game_id TEXT, screen TEXT, started INTEGER, ended INTEGER);
      CREATE INDEX IF NOT EXISTS intervals_time ON intervals(env,ended,visitor);
      CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, room_id TEXT, env TEXT, version TEXT, mode TEXT, source_type TEXT, owner TEXT, humans INTEGER, ais INTEGER, started INTEGER, effective INTEGER, finished INTEGER, ended INTEGER, status TEXT, reason TEXT);
      CREATE INDEX IF NOT EXISTS games_effective ON games(env,effective);
      CREATE INDEX IF NOT EXISTS games_finished ON games(env,finished);
      CREATE INDEX IF NOT EXISTS games_time ON games(env,started,mode);
      CREATE TABLE IF NOT EXISTS participants(game_id TEXT, seat INTEGER, visitor TEXT, is_ai INTEGER, PRIMARY KEY(game_id,seat));
      CREATE INDEX IF NOT EXISTS participants_visitor ON participants(visitor,game_id);
      CREATE TABLE IF NOT EXISTS turns(game_id TEXT, id TEXT, seat INTEGER, visitor TEXT, is_ai INTEGER, at INTEGER, retracted INTEGER DEFAULT 0, PRIMARY KEY(game_id,id));
      CREATE INDEX IF NOT EXISTS turns_visitor ON turns(visitor,at,is_ai,retracted);
      CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, env TEXT, version TEXT, created INTEGER, started INTEGER, closed INTEGER, reason TEXT, humans INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, name TEXT, source TEXT, medium TEXT, campaign TEXT, content TEXT, created INTEGER);
      CREATE TABLE IF NOT EXISTS admin_sessions(hash TEXT PRIMARY KEY, csrf TEXT, expires INTEGER);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER, action TEXT, detail TEXT);
    `);
    if(!this.db.prepare("SELECT 1 FROM meta WHERE key='event_total'").get())this.db.prepare("INSERT INTO meta VALUES ('event_total',(SELECT COUNT(*) FROM events))").run();
    if(backfillVersions)this.db.exec("INSERT OR IGNORE INTO app_versions SELECT DISTINCT version FROM events WHERE version<>''");
    for (const file of [this.filename,this.filename+'-wal',this.filename+'-shm']) if(existsSync(file)) chmodSync(file,0o600);
    const visitorColumns = this.db.pragma('table_info(visitors)') as {name:string}[];
    if(!visitorColumns.some(c=>c.name==='touch_at')) this.db.exec('ALTER TABLE visitors ADD COLUMN touch_at INTEGER');
    this.db.prepare('INSERT OR IGNORE INTO meta VALUES (?,?)').run('started_at', String(Date.now()));
    this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('metric_version', METRIC_VERSION);
  }
  count(key: string, amount = 1) {
    this.db.prepare("INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+CAST(excluded.value AS INTEGER)").run(key, String(amount));
  }
  register(ctx: VisitorContext) {
    if(ctx.version)this.db.prepare('INSERT OR IGNORE INTO app_versions VALUES (?)').run(ctx.version);
    this.db.prepare('INSERT OR IGNORE INTO visitors(id,env,first_seen,kind,device,browser,version,source,medium,campaign,content,campaign_id) VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?)').run(ctx.visitorId, ctx.environment, ctx.legacy ? 'historical_unknown' : 'new', ctx.device, ctx.browser, ctx.version, ctx.source, ctx.medium, ctx.campaign, ctx.content, ctx.campaignId);
  }
  touch(ctx: VisitorContext) {
    const at=ctx.touchAt||Date.now(), id=ctx.pageId ? ctx.visitorId+':'+ctx.environment+':'+ctx.pageId : randomUUID();
    this.db.prepare('INSERT OR IGNORE INTO touches VALUES (?,?,?,?,?,?,?,?,?)').run(id, ctx.visitorId, ctx.environment, at, ctx.source, ctx.medium, ctx.campaign, ctx.content, ctx.campaignId);
    this.db.prepare('UPDATE visitors SET touch_at=?,source=?,medium=?,campaign=?,content=?,campaign_id=?,version=?,device=?,browser=? WHERE id=? AND env=? AND (touch_at IS NULL OR touch_at>?)').run(at,ctx.source,ctx.medium,ctx.campaign,ctx.content,ctx.campaignId,ctx.version,ctx.device,ctx.browser,ctx.visitorId,ctx.environment,at);
    if(ctx.legacy)this.db.prepare("UPDATE visitors SET kind='historical_unknown' WHERE id=? AND env=?").run(ctx.visitorId,ctx.environment);
  }
  private session(ctx: VisitorContext, at: number): string {
    const candidates = this.db.prepare('SELECT * FROM sessions WHERE visitor=? AND env=? AND started<=? AND last_seen>=? ORDER BY started').all(ctx.visitorId, ctx.environment, at + SESSION_GAP, at - SESSION_GAP) as { id: string; started: number; last_seen: number }[];
    const old = candidates[0];
    if (old) {
      const earliest = Math.min(at, ...candidates.map(s=>s.started)), latest = Math.max(at, ...candidates.map(s=>s.last_seen));
      for (const other of candidates.slice(1)) {
        this.db.prepare('UPDATE events SET session=? WHERE session=?').run(old.id, other.id);
        this.db.prepare('UPDATE intervals SET session=? WHERE session=?').run(old.id, other.id);
        this.db.prepare('DELETE FROM sessions WHERE id=?').run(other.id);
      }
      this.db.prepare('UPDATE sessions SET started=?,last_seen=? WHERE id=?').run(earliest, latest, old.id);
      if (at < old.started) this.db.prepare('UPDATE sessions SET source=?,medium=?,campaign=? WHERE id=?').run(ctx.source,ctx.medium,ctx.campaign,old.id);
      return old.id;
    }
    const id = randomUUID();
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?)').run(id, ctx.visitorId, ctx.environment, at, at, ctx.source, ctx.medium, ctx.campaign);
    return id;
  }
  ingest(ctx: VisitorContext, input: unknown[], source: 'client' | 'server' = 'client', now = Date.now()) {
    const accepted: string[] = [], rejected: { id: string; reason: string }[] = [];
    this.register(ctx);
    this.db.transaction(() => {
      const ordered = [...input].sort((a, b) => Number((a as AnalyticsEvent)?.at || 0) - Number((b as AnalyticsEvent)?.at || 0) || Number((b as AnalyticsEvent)?.name === 'game_started') - Number((a as AnalyticsEvent)?.name === 'game_started'));
      for (const raw of ordered) {
        const e = raw as AnalyticsEvent;
        try {
          this.db.transaction(() => {
          if (!e || !idIsValid(e.id) || !Number.isFinite(e.at) || typeof e.name !== 'string') throw new Error('invalid_event');
          if (source === 'client' && !CLIENT_EVENTS.has(e.name)) throw new Error('invalid_event_name');
          if (e.at > now + 300_000 || e.at < now - 7 * DAY) throw new Error('invalid_event_time');
          if (e.screen && !SCREENS.has(e.screen)) throw new Error('invalid_screen');
          if (e.gameId && !idIsValid(e.gameId)) throw new Error('invalid_game_id');
          if (e.roomId && !idIsValid(e.roomId)) throw new Error('invalid_room_id');
          if (e.name === 'screen_view' && (!idIsValid(e.pageId) || !idIsValid(e.navigationId) || !e.screen)) throw new Error('missing_navigation');
          if (e.props && (typeof e.props !== 'object' || Array.isArray(e.props))) throw new Error('invalid_props');
          const props: Record<string,unknown> = {schemaVersion:1,...sanitizeProps(e.props || {})};
          if (e.name === 'game_started' && source === 'client' && Array.isArray(e.props?.seats) && e.props.seats.length > 3) throw new Error('invalid_seats');
          if (source === 'client' && ['game_started','turn_committed','turn_retracted','game_finished','game_reopened','game_exit_confirmed'].includes(e.name)) {
            if (!e.gameId?.startsWith('local_')) throw new Error('online_events_are_server_owned');
            const game = this.db.prepare('SELECT owner,source_type,started FROM games WHERE id=?').get(e.gameId) as { owner: string; source_type: string; started: number } | undefined;
            if (game && e.at < game.started) throw new Error('event_before_game');
            if (game && e.name === 'turn_committed' && !this.db.prepare('SELECT 1 FROM participants WHERE game_id=? AND seat=?').get(e.gameId, Number(props.seat))) throw new Error('invalid_seat');
            if (game && (game.owner !== ctx.visitorId || game.source_type !== 'client')) throw new Error('game_owner_mismatch');
            if (e.name === 'game_started' && (!Array.isArray(props.seats) || props.seats.length < 2 || props.seats.length > 3 || props.seats.some(x => typeof x !== 'boolean'))) throw new Error('invalid_seats');
            if (['turn_committed','turn_retracted'].includes(e.name) && !idIsValid(props.turnId)) throw new Error('invalid_turn');
            if (e.name === 'turn_committed' && (!Number.isInteger(props.seat) || Number(props.seat) < 1 || Number(props.seat) > 3)) throw new Error('invalid_seat');
          }
          if(e.at>now)this.count('future_clamped');
          const at = Math.min(e.at, now);
          const session = this.session(ctx, at);
          const eventVersion=typeof e.version === 'string'?e.version.slice(0,24):ctx.version;
          const inserted = this.db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(e.id, e.name, at, now, ctx.visitorId, session, ctx.environment, source, eventVersion, ctx.device, ctx.browser, e.screen || '', e.gameId || '', e.roomId || '', e.pageId || '', e.navigationId || '', JSON.stringify(props));
          if (!inserted.changes) { this.count('duplicates'); return; }
          this.count('event_total');
          if(eventVersion)this.db.prepare('INSERT OR IGNORE INTO app_versions VALUES (?)').run(eventVersion);
          if (e.name === 'screen_view') this.db.prepare('UPDATE visitors SET first_seen=CASE WHEN first_seen IS NULL THEN ? ELSE MIN(first_seen,?) END WHERE id=? AND env=?').run(at, at, ctx.visitorId, ctx.environment);
          if (e.name === 'foreground_interval') {
            const duration = Math.min(30_000, Math.max(0, Number(props.durationMs) || 0));
            this.db.prepare('INSERT OR IGNORE INTO intervals VALUES (?,?,?,?,?,?,?,?)').run(e.id, ctx.visitorId, ctx.environment, session, e.gameId || '', e.screen || '', at - duration, at);
          }
          if (e.name === 'queue_dropped') this.count('client_queue_dropped', Math.min(500, Math.max(0, Number(props.count) || 0)));
          if (source === 'client' && e.gameId?.startsWith('local_')) this.projectLocal(ctx, { ...e, at, props });
          if (now - at > 60_000) this.count('late_events');
          this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('last_accepted', String(now));
          })();
          accepted.push(e.id);
        } catch (error) {
          this.count('rejected'); rejected.push({ id: typeof e?.id === 'string' ? e.id.slice(0, 120) : '', reason: error instanceof Error ? error.message : 'invalid_event' });
        }
      }
      this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('last_ingest', String(now));
    })();
    return { accepted, rejected };
  }
  private projectLocal(ctx: VisitorContext, e: AnalyticsEvent) {
    const p = e.props || {}, id = e.gameId!;
    if (e.name === 'game_started') {
      const seats = p.seats as boolean[];
      const humans = seats.filter(x => !x).length;
      const mode = humans === 0 ? 'ai_only' : humans === seats.length ? 'local_human' : 'local_ai';
      this.db.prepare('INSERT OR IGNORE INTO games VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?)').run(id, '', ctx.environment, ctx.version, mode, 'client', ctx.visitorId, humans, seats.length - humans, e.at, 'started', '');
      seats.forEach((ai, index) => this.db.prepare('INSERT OR IGNORE INTO participants VALUES (?,?,?,?)').run(id, index + 1, ai ? null : ctx.visitorId, Number(ai)));
      const pending = this.db.prepare("SELECT name,at,props FROM events WHERE game_id=? AND visitor=? AND source_type='client' AND name IN ('turn_committed','turn_retracted','game_finished','game_reopened','game_exit_confirmed') ORDER BY at,json_extract(props,'$.sequence'),received").all(id, ctx.visitorId) as { name: string; at: number; props: string }[];
      for (const row of pending) this.projectLocal(ctx, { id: '', name: row.name, at: row.at, gameId: id, props: JSON.parse(row.props) });
      return;
    }
    const game = this.db.prepare('SELECT owner,source_type,started FROM games WHERE id=?').get(id) as { owner: string; source_type: string; started: number } | undefined;
    if (!game || game.owner !== ctx.visitorId || game.source_type !== 'client' || e.at < game.started) return;
    if (e.name === 'turn_committed') this.turn(id, String(p.turnId), Number(p.seat), e.at);
    if (e.name === 'turn_retracted') { this.db.prepare('UPDATE turns SET retracted=1 WHERE game_id=? AND id=?').run(id, String(p.turnId)); this.refreshEffective(id); }
    if (['game_finished','game_reopened','game_exit_confirmed'].includes(e.name)) this.refreshLocalLifecycle(id, ctx.visitorId, game.started);
  }
  private refreshLocalLifecycle(id: string, owner: string, started: number) {
    const evidence = this.db.prepare("SELECT name,at,props FROM events WHERE game_id=? AND visitor=? AND source_type='client' AND at>=? AND name IN ('game_finished','game_reopened','game_exit_confirmed') ORDER BY at,json_extract(props,'$.sequence'),received,id").all(id, owner, started) as { name:string; at:number; props:string }[];
    let finished:number|null=null, ended:number|null=null, status='started', reason='';
    for (const row of evidence) {
      if (row.name==='game_finished') { finished=row.at; ended=row.at; status='finished'; reason=String(JSON.parse(row.props).reason||'rules_end'); }
      if (row.name==='game_reopened') { finished=null; ended=null; status='started'; reason=''; }
      if (row.name==='game_exit_confirmed' && finished===null) { ended=row.at; status='exit_confirmed'; reason='user_exit'; }
    }
    this.db.prepare('UPDATE games SET finished=?,ended=?,status=?,reason=? WHERE id=?').run(finished,ended,status,reason,id);
  }
  startOnline(id: string, roomId: string, ctx: VisitorContext, seats: { visitor: string | null; ai: boolean }[], at = Date.now()) {
    const humans = seats.filter(s => !s.ai).length;
    this.db.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO games VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?)').run(id, roomId, ctx.environment, ctx.version, humans === 0 ? 'ai_only' : humans >= 2 ? 'online_human' : 'online_ai', 'server', '', humans, seats.length - humans, at, 'started', '');
      seats.forEach((s, i) => this.db.prepare('INSERT OR IGNORE INTO participants VALUES (?,?,?,?)').run(id, i + 1, s.ai ? null : s.visitor, Number(s.ai)));
      this.db.prepare('UPDATE rooms SET started=? WHERE id=?').run(at, roomId);
    })();
    this.serverEvent(ctx, 'game_started', { gameId: id, roomId });
  }
  turn(gameId: string, id: string, seat: number, at = Date.now()) {
    const p = this.db.prepare('SELECT visitor,is_ai FROM participants WHERE game_id=? AND seat=?').get(gameId, seat) as { visitor: string | null; is_ai: number } | undefined;
    if (!p) return;
    this.db.prepare('INSERT OR IGNORE INTO turns(game_id,id,seat,visitor,is_ai,at) VALUES (?,?,?,?,?,?)').run(gameId, id, seat, p.visitor, p.is_ai, at);
    // A retraction may precede the turn due to an offline retry arriving out of order.
    const retracted = this.db.prepare("SELECT 1 FROM events WHERE game_id=? AND name='turn_retracted' AND json_extract(props,'$.turnId')=? LIMIT 1").get(gameId, id);
    if (retracted) this.db.prepare('UPDATE turns SET retracted=1 WHERE game_id=? AND id=?').run(gameId, id);
    this.refreshEffective(gameId);
  }
  private refreshEffective(gameId: string) {
    this.db.prepare('UPDATE games SET effective=(SELECT MIN(at) FROM turns WHERE game_id=? AND is_ai=0 AND retracted=0) WHERE id=?').run(gameId, gameId);
  }
  finish(gameId: string, at = Date.now(), reason = 'rules_end') {
    this.db.prepare("UPDATE games SET finished=COALESCE(finished,?),ended=COALESCE(ended,?),status='finished',reason=? WHERE id=?").run(at, at, reason, gameId);
  }
  interrupt(gameId: string, reason: string) {
    this.db.prepare("UPDATE games SET status='interrupted',reason=?,ended=? WHERE id=? AND finished IS NULL").run(reason, Date.now(), gameId);
  }
  serverEvent(ctx: VisitorContext, name: string, extra: Partial<AnalyticsEvent> = {}) {
    return this.ingest(ctx, [{ id: randomUUID(), name, at: Date.now(), ...extra }], 'server');
  }
  close() { this.db.close(); }
}

function sanitizeProps(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ['seats','seat','turnId','reason','durationMs','count','success','section','kind','duration','revision','sequence','schemaVersion','rulesVersion','viewport','remaining']) {
    const value = input[key];
    if (key === 'seats' && Array.isArray(value)) result[key] = value.slice(0, 4);
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) result[key] = value;
    else if (typeof value === 'string') result[key] = value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 100);
  }
  return result;
}
