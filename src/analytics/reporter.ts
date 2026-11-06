import { Worker } from 'node:worker_threads';
import type { ReportFilter } from './report.js';
import { businessDate } from './model.js';
export class Reporter {
  private worker: Worker | null = null;
  private next = 0;
  private pending = new Map<number, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(privateFilename: string) { this.filename = privateFilename; queueMicrotask(() => { const day = businessDate(Date.now()); void this.query({ from: day, to: day }).catch(() => {}); }); }
  private filename: string;
  query(filter: ReportFilter): Promise<unknown> { return this.request({ filter }); }
  queryLegacy(legacy: string): Promise<unknown> { return this.request({ legacy }); }
  queryHistory(): Promise<unknown> { return this.request({ history: true }); }
  private request(payload: { filter?: ReportFilter; legacy?: string; history?: boolean }): Promise<unknown> {
    if (this.pending.size >= 8) return Promise.reject(new Error('Too many report queries. Try again shortly.'));
    if (!this.worker) {
      this.worker = new Worker(new URL('./report.worker.js', import.meta.url), { workerData: { filename: this.filename } });
      const worker = this.worker;
      worker.unref();
      const fail = () => { if (this.worker !== worker) return; for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('The analytics worker restarted. Please retry.')); } this.pending.clear(); this.worker = null; };
      worker.on('error', fail);
      worker.on('exit', fail);
      worker.on('message', (message) => {
        const task = this.pending.get(message.id); if (!task) return;
        clearTimeout(task.timer); this.pending.delete(message.id);
        if (message.error) task.reject(new Error(message.error)); else task.resolve(message.result);
      });
    }
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.get(id)?.reject(new Error('Report query timed out.')); this.pending.delete(id); const worker = this.worker; this.worker = null; for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('Report query timed out.')); } this.pending.clear(); void worker?.terminate(); }, 15_000);
      this.pending.set(id, { resolve, reject, timer }); this.worker!.postMessage({ id, ...payload });
    });
  }
}
