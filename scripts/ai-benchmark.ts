import { Game } from '../src/engine/game.js';
import { decide, applyMove, moves, analyzeCompletion, remainingCounts } from '../src/engine/ai/strategy.js';
import { getRotatedRegions } from '../src/data/tiles.js';
import { findFeature } from '../src/engine/scoring.js';
import { writeFileSync } from 'node:fs';
const seeds = Number(process.env.AI_SEEDS ?? 200), nodes = Number(process.env.AI_NODES ?? 48);
const configs = [{ name: 'New', color: 'red', isAI: true, meepleImg: '', avatarImg: '' }, { name: 'Legacy', color: 'blue', isAI: true, meepleImg: '', avatarImg: '' }];
let wins = 0, ties = 0, margin = 0, turns = 0; const elapsed: number[] = [];
const rows: { seed: number; seat: number; margin: number }[] = [];
const observations: { game: number; key: string; completed: boolean }[] = [];
function legacy(g: Game) {
  const s = g.publicSnapshot(); let best: ReturnType<typeof decide>['move'], max = -Infinity;
  for (const m of moves(s)) {
    if (m.region) continue;
    let score = 0;
    for (const r of getRotatedRegions(s.currentTile!.label, m.rotation)) {
      if (r.type === 'Lighthouse') { let n = 1; for (let x = -1; x <= 1; x++)for (let y = -1; y <= 1; y++)if ((x || y) && g.board.getTile(m.x + x, m.y + y)) n++; score += n * 0.5 + (n === 8 ? 10 : 0); }
      else if (r.type === 'Road' || r.type === 'Beach') for (const e of r.edges) { const [x, y] = [[0, -1], [1, 0], [0, 1], [-1, 0]][e]; if (g.board.getTile(m.x + x, m.y + y)) score++; }
    }
    for (const [x, y] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (g.board.getTile(m.x + x, m.y + y)) score += 0.3;
    if (score > max) { max = score; best = m; }
  }
  if (best && s.players[s.currentIndex].meeples > 2 && (turns * 16807 % 10) >= 3) {
    const available = [...moves(s)].filter(m => m.x === best!.x && m.y === best!.y && m.rotation === best!.rotation && m.region);
    available.sort((a, b) => {
      const priority = (m: typeof a) => ({ Lighthouse: 5, Beach: 3, Road: 2, Sea: 1 }[getRotatedRegions(s.currentTile!.label, m.rotation).find(r => r.id === m.region)!.type as 'Sea'] ?? 0);
      return priority(b) - priority(a);
    }); if (available[0]) best = available[0];
  }
  return best;
}
for (let seed = 1; seed <= seeds; seed++)for (let seat = 0; seat < 2; seat++) {
  const g = new Game(configs, seed * 7919); g.isOnline = false; g.simulation = true; g.start();
  const tracked: { tile: ReturnType<Game['board']['getAllTiles']>[number]; region: string; key: string }[] = [];
  for (let turn = 0; turn < 90 && g.state !== 'GAME_OVER'; turn++) {
    const s = g.publicSnapshot(); let move;
    if (g.playerManager.currentIndex === seat) { const r = decide(s, { nodes, seed: seed * 31 }); elapsed.push(r.elapsedMs); move = r.move; }
    else move = legacy(g);
    if (!move || !applyMove(g, move)) throw new Error('Invalid benchmark move'); turns++;
    if (turn % 8 === 0 && g.state !== 'GAME_OVER') for (const tile of g.board.getAllTiles()) {
      if (!tile.meeple || !tile.meeple.regionId.startsWith('beach')) continue;
      const a = analyzeCompletion(g.board, tile, tile.meeple.regionId, remainingCounts(g.publicSnapshot()));
      const key = [Math.floor((79 - g.board.getAllTiles().length) / 20), Math.min(4, a.slots), Math.min(3, Math.floor(Math.min(...a.compatible) / 3))].join(':');
      tracked.push({ tile, region: tile.meeple.regionId, key });
    }
  }
  if (g.state !== 'GAME_OVER') throw new Error('Unfinished benchmark');
  const diff = g.playerManager.players[seat].score - g.playerManager.players[1 - seat].score;
  if (diff > 0) wins++; if (diff === 0) ties++; margin += diff; rows.push({ seed, seat, margin: diff });
  for (const t of tracked) {
    const actual = g.board.getTile(t.tile.x, t.tile.y)!;
    observations.push({ game: seed, key: t.key, completed: findFeature(g.board, actual, t.region).isCompleted });
  }
  if (rows.length % 20 === 0) console.log(JSON.stringify({ games: rows.length, wins, ties, meanMargin: margin / rows.length }));
}
elapsed.sort((a, b) => a - b);
const result = { configuration: { seeds, nodes, policy: 'inventory-heuristic', opponent: 'legacy heuristic reproduction; deterministic tie/skip' }, games: rows.length, wins, ties, winShare: (wins + ties / 2) / rows.length, meanMargin: margin / rows.length, p50: elapsed[Math.floor(elapsed.length * .5)], p95: elapsed[Math.floor(elapsed.length * .95)], turns, rows, observations };
writeFileSync('docs/AI_BENCHMARK.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ...result, rows: undefined, observations: undefined }));
