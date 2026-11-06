import { GAME_AI_OPTIONS } from './ai/config.js';
import type { Game } from './game.js';
import { decide, type Decision, type AiMove } from './ai/strategy.js';
import type { PublicGameSnapshot } from './game.js';
import { paceAiDecision } from './ai/pacing.js';

export function computeInWorker(snapshot: PublicGameSnapshot, signal?: AbortSignal): Promise<Decision> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('cancelled')); return; }
    if (typeof Worker === 'undefined') { resolve(decide(snapshot, { ...GAME_AI_OPTIONS, budgetMs: 30 })); return; }
    let worker: Worker;
    try { worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' }); }
    catch { resolve(decide(snapshot, { ...GAME_AI_OPTIONS, budgetMs: 30 })); return; }
    const cleanup = () => { worker.terminate(); clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(new Error('cancelled')); };
    const fallback = () => { cleanup(); resolve(decide(snapshot, { ...GAME_AI_OPTIONS, budgetMs: 15 })); };
    const timer = setTimeout(fallback, 3500);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = e => { cleanup(); if (e.data.result) resolve(e.data.result); else resolve(decide(snapshot, { ...GAME_AI_OPTIONS, budgetMs: 15 })); };
    worker.onerror = fallback;
    worker.postMessage({ snapshot, options: GAME_AI_OPTIONS });
  });
}
export function commitLocalMove(game: Game, move: AiMove): boolean {
  if (game.state !== 'PLACE_TILE') return false;
  while (game.currentRotation !== move.rotation) game.rotateTile();
  if (!game.tentativePlace(move.x, move.y)) return false;
  return move.region ? game.placeMeeple(move.region) : game.skipMeeple();
}
const pending = new WeakSet<Game>();
export async function performAiTurn(game: Game, signal?: AbortSignal) {
  if (game.isOnline || pending.has(game) || game.state !== 'PLACE_TILE' || !game.currentTile) return;
  pending.add(game); const tick = game.tick;
  try {
    const result = await paceAiDecision(computeInWorker(game.publicSnapshot(), signal), signal);
    if (!signal?.aborted && game.tick === tick && game.state === 'PLACE_TILE' && result?.move) commitLocalMove(game, result.move);
  } finally { pending.delete(game); }
}
