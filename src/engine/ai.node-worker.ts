import { parentPort } from 'node:worker_threads';
import { decide } from './ai/strategy.js';
parentPort!.on('message', data => {
  try { parentPort!.postMessage({ result: decide(data.snapshot, data.options) }); }
  catch (error) { parentPort!.postMessage({ error: String(error) }); }
});
