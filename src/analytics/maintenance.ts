import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, renameSync, chmodSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DAY, businessDate, dateStart } from './model.js';

export async function maintainAnalytics(filename: string, now = Date.now()) {
  const db = new Database(filename); db.pragma('busy_timeout = 1500');
  try {
    const cutoff = dateStart(businessDate(now - 90 * DAY));
    db.exec('CREATE TABLE IF NOT EXISTS daily_history(day TEXT,env TEXT,pv INTEGER,uv INTEGER,active INTEGER,games INTEGER,finished INTEGER,PRIMARY KEY(day,env))');
    const groups = db.prepare("WITH days AS (SELECT date(at/1000,'unixepoch','+8 hours') day,env FROM events WHERE at>=@cutoff UNION SELECT date(started/1000,'unixepoch','+8 hours'),env FROM games WHERE started>=@cutoff UNION SELECT date(finished/1000,'unixepoch','+8 hours'),env FROM games WHERE finished>=@cutoff) SELECT d.day,d.env,COALESCE(e.pv,0) pv,COALESCE(e.uv,0) uv FROM days d LEFT JOIN (SELECT date(at/1000,'unixepoch','+8 hours') day,env,COUNT(*) pv,COUNT(DISTINCT visitor) uv FROM events WHERE name='screen_view' AND at>=@cutoff GROUP BY day,env) e ON e.env=d.env AND e.day=d.day").all({ cutoff: cutoff }) as { day: string; env: string; pv: number; uv: number }[];
    for (const group of groups) {
      const start = Date.parse(group.day + 'T00:00:00+08:00'), end = start + DAY;
      const active = db.prepare('SELECT COUNT(DISTINCT t.visitor) n FROM turns t JOIN games g ON g.id=t.game_id WHERE g.env=? AND t.is_ai=0 AND t.retracted=0 AND t.at>=? AND t.at<?').get(group.env, start, end) as { n: number };
      const games = db.prepare('SELECT COUNT(*) n FROM games WHERE env=? AND humans>0 AND started>=? AND started<?').get(group.env, start, end) as { n: number };
      const finished = db.prepare('SELECT COUNT(*) n FROM games WHERE env=? AND humans>0 AND finished>=? AND finished<?').get(group.env, start, end) as { n: number };
      db.prepare('INSERT OR REPLACE INTO daily_history VALUES (?,?,?,?,?,?,?)').run(group.day, group.env, group.pv, group.uv, active.n, games.n, finished.n);
    }
    const dir = path.join(path.dirname(filename), 'backups'); mkdirSync(dir, { recursive: true, mode: 0o700 });
    const basename = 'analytics-v2-' + businessDate(now) + '.sqlite', target = path.join(dir, basename), temp = target + '.partial';
    const last = db.prepare("SELECT value FROM meta WHERE key='last_backup'").get() as { value: string } | undefined;
    if (!last || businessDate(Date.parse(last.value)) !== businessDate(now)) {
      rmSync(temp, { force: true }); await db.backup(temp);
      const check = new Database(temp, { readonly: true });
      try { if (check.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Backup consistency check failed'); } finally { check.close(); }
      chmodSync(temp, 0o600); renameSync(temp, target);
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('last_backup', new Date(now).toISOString());
      for (const old of readdirSync(dir).filter(f => /^analytics-v2-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().reverse().slice(7)) rmSync(path.join(dir, old));
    }
    for (const table of ['events','intervals','touches']) {
      const column = table === 'intervals' ? 'ended' : 'at';
      const prune = db.transaction(() => {
        const changed=db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${column}<? LIMIT 2000)`).run(cutoff).changes;
        if(table==='events'&&changed)db.prepare("UPDATE meta SET value=MAX(0,CAST(value AS INTEGER)-?) WHERE key='event_total'").run(changed);
        return changed;
      });
      while (prune()) await new Promise(resolve => setTimeout(resolve, 10));
    }
    db.transaction(() => {
      db.prepare('DELETE FROM games WHERE started<?').run(now - 400 * DAY);
      db.prepare('DELETE FROM participants WHERE NOT EXISTS(SELECT 1 FROM games WHERE games.id=participants.game_id)').run();
      db.prepare('DELETE FROM turns WHERE NOT EXISTS(SELECT 1 FROM games WHERE games.id=turns.game_id)').run();
      db.prepare('DELETE FROM rooms WHERE created<?').run(now - 400 * DAY);
      db.prepare('DELETE FROM sessions WHERE last_seen<?').run(now - 400 * DAY);
      db.prepare('DELETE FROM visitors WHERE first_seen<? AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.visitor=visitors.id AND s.env=visitors.env)').run(now - 400 * DAY);
      db.prepare('DELETE FROM admin_sessions WHERE expires<?').run(now);
      db.prepare('DELETE FROM daily_history WHERE day<?').run(businessDate(now - 730 * DAY));
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('last_maintenance', String(now));
      db.prepare("DELETE FROM meta WHERE key='maintenance_error'").run();
      db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=MAX(CAST(value AS INTEGER),CAST(excluded.value AS INTEGER))').run('raw_cutoff', String(cutoff));
    })();
  } finally { db.close(); }
}
