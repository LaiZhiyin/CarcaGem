import type { Decision } from './strategy.js';

// Keep a complete AI move visible before the next one, even on fast devices.
export const AI_TURN_TIMING = Object.freeze({ startDelayMs: 80, minimumThinkingMs: 1200 });

export function waitForAiDelay(durationMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (durationMs <= 0) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      resolve(ready);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(true), durationMs);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function paceAiDecision(decision: Promise<Decision>, signal?: AbortSignal): Promise<Decision | undefined> {
  const startedAt = Date.now();
  const result = await decision;
  const remainingDelay = AI_TURN_TIMING.minimumThinkingMs - (Date.now() - startedAt);
  return await waitForAiDelay(remainingDelay, signal) ? result : undefined;
}
