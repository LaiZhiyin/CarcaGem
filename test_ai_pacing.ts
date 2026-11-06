// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_TURN_TIMING, paceAiDecision, waitForAiDelay } from './src/engine/ai/pacing';
import type { Decision } from './src/engine/ai/strategy';

const decision: Decision = { move: { x: 1, y: 0, rotation: 0 }, evaluated: 1, samples: 1, elapsedMs: 1, completedRounds: 1, exhausted: false, value: 0, model: 'test' };
afterEach(() => vi.useRealTimers());

describe('shared local and online AI pace', () => {
  it('holds a fast decision until the visible thinking interval is complete', async () => {
    vi.useFakeTimers();
    const onReady = vi.fn();
    const pending = paceAiDecision(Promise.resolve(decision)).then(onReady);
    await vi.advanceTimersByTimeAsync(AI_TURN_TIMING.minimumThinkingMs - 1);
    expect(onReady).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(onReady).toHaveBeenCalledWith(decision);
  });

  it('does not add a full second thinking interval after a slow search', async () => {
    vi.useFakeTimers();
    const onReady = vi.fn();
    const slow = new Promise<Decision>(resolve => setTimeout(() => resolve(decision), 2000));
    const pending = paceAiDecision(slow).then(onReady);
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(onReady).toHaveBeenCalledWith(decision);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a ready move when leaving the game or undoing during the pause', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = paceAiDecision(Promise.resolve(decision), controller.signal);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    expect(await pending).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the online reward/start pause without leaving a timer behind', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = waitForAiDelay(2000, controller.signal);
    controller.abort();
    expect(await pending).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(await waitForAiDelay(0, controller.signal)).toBe(false);
  });
});
