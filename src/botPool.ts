import { Worker } from 'node:worker_threads';
import type { PublicGameSnapshot } from './engine/game.js';
import { type Decision, type Options } from './engine/ai/strategy.js';
interface Job { snapshot: PublicGameSnapshot; options: Options; signal: AbortSignal; resolve: (d: Decision) => void; reject: (e: Error) => void; queuedCancel?: () => void; timer?: ReturnType<typeof setTimeout>; }
const queue: Job[] = [];
let active = 0;
const concurrency = 2;
export function botDecision(snapshot: PublicGameSnapshot, options: Options, signal: AbortSignal): Promise<Decision> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    if (queue.length >= 64) { reject(new Error('AI queue full')); return; }
    const job: Job = { snapshot, options, signal, resolve, reject };
    job.queuedCancel = () => {
      const index = queue.indexOf(job); if (index < 0) return;
      queue.splice(index, 1); clearTimeout(job.timer); signal.removeEventListener('abort', job.queuedCancel!); reject(new Error('AI queue cancelled or timed out'));
    };
    job.timer = setTimeout(job.queuedCancel, 5000);
    signal.addEventListener('abort', job.queuedCancel, { once: true });
    queue.push(job); pump();
  });
}
function pump() {
  while (active < concurrency && queue.length) {
    const job = queue.shift()!;
    clearTimeout(job.timer); job.signal.removeEventListener('abort', job.queuedCancel!);
    if (job.signal.aborted) { job.reject(new Error('cancelled')); continue; }
    active++;
    let worker: Worker | undefined;
    let finished = false;
    const finish = (error?: Error, result?: Decision) => {
      if (finished) return; finished = true; clearTimeout(timer); job.signal.removeEventListener('abort', cancel);
      void worker?.terminate(); active--; if (error) job.reject(error); else job.resolve(result!); pump();
    };
    const cancel = () => finish(new Error('cancelled'));
    const timer = setTimeout(() => finish(new Error('AI timeout')), 3500);
    job.signal.addEventListener('abort', cancel, { once: true });
    try {
      const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
      worker = new Worker(new URL(`./engine/ai.node-worker.${extension}`, import.meta.url));
      worker.once('message', data => finish(data.error ? new Error(data.error) : undefined, data.result));
      worker.once('error', error => finish(error));
      worker.once('exit', () => { if (!finished) finish(new Error('AI worker exited')); });
      worker.postMessage({ snapshot: job.snapshot, options: job.options });
    } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  }
}
