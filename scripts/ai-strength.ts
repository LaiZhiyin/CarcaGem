import { Game } from '../src/engine/game.js';
import { decide, applyMove } from '../src/engine/ai/strategy.js';
import { writeFileSync } from 'node:fs';
const rows = [];
for (let seed = 1; seed <= Number(process.env.AI_SEEDS ?? 4); seed++)for (let seat = 0; seat < 2; seat++) {
  const g = new Game([{ name: 'A', color: 'red', isAI: true, meepleImg: '', avatarImg: '' }, { name: 'B', color: 'blue', isAI: true, meepleImg: '', avatarImg: '' }], seed * 3571); g.isOnline = false; g.simulation = true; g.start();
  const decisions = [];
  for (let turn = 0; turn < 90 && g.state !== 'GAME_OVER'; turn++) {
    const difficulty = g.playerManager.currentIndex === seat ? 'hard' : 'normal';
    const r = decide(g.publicSnapshot(), { difficulty, budgetMs: difficulty === 'hard' ? Number(process.env.HARD_MS ?? 500) : Number(process.env.NORMAL_MS ?? 200), seed: 1 });
    decisions.push({ difficulty, ms: r.elapsedMs, samples: r.samples, completedRounds: r.completedRounds, evaluated: r.evaluated });
    if (!r.move || !applyMove(g, r.move)) throw new Error('Failed turn');
  }
  rows.push({ seed, seat, scores: g.playerManager.players.map(p => p.score), margin: g.playerManager.players[seat].score - g.playerManager.players[1 - seat].score, decisions }); console.log(JSON.stringify({ seed, seat, margin: rows.at(-1)!.margin }));
}
writeFileSync('docs/AI_SEARCH_BENCHMARK.json', JSON.stringify({ budget: { hard: Number(process.env.HARD_MS ?? 500), normal: Number(process.env.NORMAL_MS ?? 200) }, rows }, null, 2));
