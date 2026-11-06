import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { buildReport } from './report.js';
import type { ReportFilter } from './report.js';
import { existsSync } from 'node:fs';
import { maintainAnalytics } from './maintenance.js';
const db = new Database(workerData.filename, { readonly: true });
db.pragma('busy_timeout = 1500');
let maintaining = false;
async function maintenance() {
  if (maintaining) return; maintaining = true;
  try { await maintainAnalytics(workerData.filename); }
  catch {
    const writer = new Database(workerData.filename);
    try { writer.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('maintenance_error', String(Date.now())); } finally { writer.close(); }
  }
  finally { maintaining = false; }
}
void maintenance(); setInterval(() => void maintenance(), 6 * 3600_000).unref();
parentPort!.on('message', ({ id, filter, legacy, history }: { id: number; filter?: ReportFilter; legacy?: string; history?: boolean }) => {
  try {
    if (history) { parentPort!.postMessage({ id, result: db.prepare('SELECT * FROM daily_history ORDER BY day DESC,env LIMIT 2200').all() }); return; }
    if (legacy) {
      if (!existsSync(legacy)) { parentPort!.postMessage({ id, result: { available: false } }); return; }
      const old = new Database(legacy, { readonly: true });
      try { const tables = ['page_views','sessions','games'].map(table => ({ table, ...(old.prepare(`SELECT COUNT(*) count FROM ${table}`).get() as object) })); parentPort!.postMessage({ id, result: { available: true, tables, warning: 'Legacy start events are client logs, not unique confirmed games. Completion and acquisition attribution cannot be reconstructed.' } }); } finally { old.close(); }
      return;
    }
    const result = db.transaction(() => buildReport(db, filter!))(); parentPort!.postMessage({ id, result });
  }
  catch (error) { parentPort!.postMessage({ id, error: error instanceof Error ? error.message : 'Query failed.' }); }
});
