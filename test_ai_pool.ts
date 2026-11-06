// @vitest-environment node
import { vi, it, expect } from 'vitest';
vi.mock('node:worker_threads', () => ({ Worker: class { constructor() { throw new Error('worker resources unavailable'); } } }));
import { botDecision } from './src/botPool';
import { Game } from './src/engine/game';
it('returns capacity after synchronous worker construction failures', async () => {
  const game = new Game([{ name: 'A', color: 'red', isAI: true, meepleImg: '', avatarImg: '' }]); game.start();
  let settled = 0;
  const jobs = Array.from({ length: 4 }, () => botDecision(game.publicSnapshot(), {}, new AbortController().signal).catch(() => { settled++; }));
  await vi.waitFor(() => expect(settled).toBe(4), { timeout: 200 });
  await Promise.all(jobs);
});
