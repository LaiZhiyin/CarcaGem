/// <reference lib="webworker" />
import { decide } from './ai/strategy.js';
self.onmessage = event => {
  try { self.postMessage({ result: decide(event.data.snapshot, event.data.options) }); }
  catch (error) { self.postMessage({ error: String(error) }); }
};
