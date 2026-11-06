import { Game, type PublicGameSnapshot } from '../game.js';
import { TILES, getRotatedRegions } from '../../data/tiles.js';
import { Board, type PlacedTile } from '../board.js';
import { findFeature, checkLighthouse, calculateScore, getHalfEdges, F_EDGE_DIR } from '../scoring.js';
import { isValidPlacement, getTentativeOccupiableRegionIds } from '../validator.js';
import { completionEstimate } from './completionModel.js';
import { getIndependentRegionId } from '../regionId.js';
import { seededShuffle } from '../random.js';

export interface AiMove { x: number; y: number; rotation: number; region?: string }
export interface Options { difficulty?: 'normal' | 'hard'; budgetMs?: number; nodes?: number; seed?: number }
export interface Analysis { slots: number; compatible: number[]; impossible: boolean; arrival: number; model: 'inventory-bound'; immediateCaps: number; }
export interface Decision { move?: AiMove; evaluated: number; samples: number; elapsedMs: number; completedRounds: number; exhausted: boolean; value: number; model: string }
export function remainingCounts(s: PublicGameSnapshot): number[] {
  const counts = TILES.map(t => t.quantity);
  for (const [, t] of s.tiles) counts[t.data.id - 1]--;
  if (s.currentTile) counts[s.currentTile.id - 1]--;
  if (counts.some(n => n < 0)) throw new Error('Public tile inventory is inconsistent');
  return counts;
}
export function arrivalProbability(n: number, k: number, h: number): number {
  if (!n || !k || h <= 0) return 0;
  let miss = 1;
  for (let i = 0; i < Math.min(h, n); i++) miss *= Math.max(0, n - k - i) / (n - i);
  return 1 - miss;
}
const rotations = [0, 90, 180, 270];
// A capacity matching failure proves impossibility; success is only a necessary condition.
export function analyzeCompletion(board: Board, tile: PlacedTile, region: string, counts: number[]): Analysis {
  const feature = findFeature(board, tile, region);
  const holes = new Map<string, { x: number; y: number }>();
  for (const fr of feature.regions) for (const edge of getHalfEdges(fr.region)) {
    const d = F_EDGE_DIR[edge], x = fr.tile.x + d.dx, y = fr.tile.y + d.dy;
    if (!board.getTile(x, y)) holes.set(`${x},${y}`, { x, y });
  }
  const candidates = [...holes.values()].map(p => TILES.filter(t => counts[t.id - 1] > 0 && rotations.some(r => isValidPlacement(board, p.x, p.y, t, r))).map(t => t.id - 1));
  const capacities = counts.map(n => Array.from({ length: n }, () => -1));
  function match(slot: number, seen: Set<number>): boolean {
    for (const type of candidates[slot]) {
      if (seen.has(type)) continue; seen.add(type);
      for (let i = 0; i < capacities[type].length; i++) {
        const previous = capacities[type][i];
        if (previous < 0 || match(previous, seen)) { capacities[type][i] = slot; return true; }
      }
    } return false;
  }
  const impossible = candidates.some((_, i) => !match(i, new Set()));
  const compatible = candidates.map(types => types.reduce((sum, t) => sum + counts[t], 0));
  const n = counts.reduce((a, b) => a + b, 0);
  let immediateCaps = 0;
  if (holes.size === 1) {
    const [position] = holes.values();
    for (const t of TILES) {
      if (!counts[t.id - 1]) continue;
      for (const r of rotations) {
        if (!isValidPlacement(board, position.x, position.y, t, r)) continue;
        const test = new Board(); test.restoreFromSerializedTiles(board.getSerializedTiles());
        test.placeTile(position.x, position.y, t, r);
        if (findFeature(test, tile, region).isCompleted) { immediateCaps += counts[t.id - 1]; break; }
      }
    }
  }
  return { immediateCaps, slots: holes.size, compatible, impossible, arrival: compatible.length ? Math.min(...compatible.map(k => arrivalProbability(n, k, Math.min(8, n)))) : 1, model: 'inventory-bound' };
}
export function applyMove(g: Game, m: AiMove): boolean {
  if (!g.currentTile || g.state !== 'PLACE_TILE' || !isValidPlacement(g.board, m.x, m.y, g.currentTile, m.rotation)) return false;
  g.currentRotation = m.rotation;
  if (!g.tentativePlace(m.x, m.y, true)) return false;
  if (m.region && !g.getAvailableMeepleRegions().includes(m.region)) return false;
  return m.region ? g.placeMeeple(m.region, true) : g.skipMeeple(true);
}
export function* moves(s: PublicGameSnapshot): Generator<AiMove> {
  if (!s.currentTile) return;
  const board = new Board(); board.restoreFromSerializedTiles(s.tiles);
  const hasMeeple = s.players[s.currentIndex].meeples > 0;
  for (const p of board.getAvailableSlots()) for (const rotation of rotations) {
    if (!isValidPlacement(board, p.x, p.y, s.currentTile, rotation)) continue;
    yield { ...p, rotation };
    if (hasMeeple) for (const region of getTentativeOccupiableRegionIds(board, p.x, p.y, s.currentTile, rotation)) yield { ...p, rotation, region };
  }
}
// Leaf estimate: base terminal points + an explicitly heuristic completion premium.
// Arrival is NOT advertised as a final closure probability.
export function values(g: Game, counts: number[], detailed = true): number[] {
  const out = g.playerManager.players.map(p => p.score);
  if (g.state === 'GAME_OVER') return out;
  const seen = new Set<string>();
  const n = counts.reduce((a, b) => a + b, 0);
  for (const tile of g.board.getAllTiles()) {
    if (!tile.meeple) continue;
    const region = getRotatedRegions(tile.data.label, tile.rotation).find(r => r.id === tile.meeple!.regionId);
    if (!region) continue;
    const f = findFeature(g.board, tile, region.id);
    const key = f.regions.map(r => r.independentRegionId).sort().join('|');
    if (seen.has(key)) continue; seen.add(key);
    const max = Math.max(...f.meeples.map(m => m.count));
    let points = 0, risk = 0;
    if (region.type === 'Lighthouse') {
      points = checkLighthouse(g.board, tile).score;
      risk = (9 - points) / 8;
      points += (9 - points) * Math.min(0.6, n / 80) * (1 - risk);
    } else if (region.type === 'Sea') {
      // Sea scores use the authoritative tracker, below; no duplicate graph algorithm.
      risk = 1;
    } else {
      points = calculateScore(f, true);
      if (detailed) {
        const a = analyzeCompletion(g.board, tile, region.id, counts);
        const opportunity = region.type === 'Beach' ? completionEstimate(n, a).probability : (a.impossible ? 0 : a.arrival / (1 + 0.65 * Math.max(0, a.slots - 1)));
        if (region.type === 'Beach') points += points * opportunity;
        risk = 1 - opportunity;
      } else risk = 0.6;
    }
    for (const m of f.meeples) {
      const i = g.playerManager.players.findIndex(p => p.id === m.playerId);
      if (m.count === max) out[i] += points;
      const free = g.playerManager.players[i].meeples;
      // Future scarcity only, diminishing towards the end; instant returns have no cost.
      out[i] -= m.count * risk * (free < 2 ? 2.5 : free < 4 ? 1 : 0.25) * Math.min(1, n / 24);
    }
  }
  for (const award of g.projectedSeaScores()) {
    const i = g.playerManager.players.findIndex(p => p.id === award.playerId);
    out[i] += award.points;
  }
  if (detailed) {
    const lookup = new Map<string, { tile: PlacedTile; region: string }>();
    for (const tile of g.board.getAllTiles()) for (const r of getRotatedRegions(tile.data.label, tile.rotation)) {
      if (r.type === 'Beach') lookup.set(getIndependentRegionId(tile, r.id), { tile, region: r.id });
    }
    const estimates = new Map<string, number>();
    for (const sea of g.seaEvaluationGroups()) {
      if (!sea.meeples.length) continue;
      let potential = 0;
      for (const beach of sea.beaches) {
        if (beach.completed) continue;
        if (!estimates.has(beach.id)) {
          const target = lookup.get(beach.regionId);
          const a = target ? analyzeCompletion(g.board, target.tile, target.region, counts) : undefined;
          estimates.set(beach.id, a ? completionEstimate(n, a).probability : 0);
        }
        potential += 3 * estimates.get(beach.id)!;
      }
      const max = Math.max(...sea.meeples.map(m => m.count));
      for (const m of sea.meeples) if (m.count === max) out[g.playerManager.players.findIndex(p => p.id === m.playerId)] += potential;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] += (g.playerManager.extraTurns[g.playerManager.players[i].id] || 0) * Math.min(2, n);
  return out;
}
function utility(v: number[], i: number): number { return v[i] - Math.max(...v.filter((_, j) => j !== i)); }
function hypothetical(counts: number[], seed: number) { return seededShuffle(TILES.flatMap((t, i) => Array.from({ length: counts[i] }, () => t)), seed); }
export function decide(s: PublicGameSnapshot, o: Options = {}): Decision {
  const difficulty = o.difficulty ?? 'hard';
  const start = performance.now(), deadline = start + (o.budgetMs ?? (difficulty === 'hard' ? 1200 : 220));
  const rootDeadline = difficulty === 'hard' && o.nodes === undefined ? start + (deadline - start) * 0.4 : deadline;
  const limit = o.nodes ?? Infinity, counts = remainingCounts(s), me = s.currentIndex;
  const future = hypothetical(counts, o.seed ?? 1);
  const candidates: { move: AiMove; value: number; sum: number; visits: number }[] = [];
  let evaluated = 0, samples = 0, completedRounds = 0, exhausted = false;
  for (const move of moves(s)) {
    if (candidates.length && (evaluated >= limit || performance.now() > rootDeadline)) { exhausted = true; break; }
    // Sampled future is independent of the real deck; leaf values do not inspect its next tile.
    const sim = Game.fromPublicSnapshot(s, future);
    if (!applyMove(sim, move)) continue;
    const value = utility(values(sim, counts), me) + (sim.state !== 'GAME_OVER' && sim.playerManager.currentIndex === me ? 1.5 : 0);
    candidates.push({ move, value, sum: 0, visits: 0 }); evaluated++;
  }
  candidates.sort((a, b) => b.value - a.value);
  // Keep diverse strategic categories alongside the leading tactical candidates.
  const pool = candidates.slice(0, 6);
  for (const kind of ['Sea', 'Beach', 'Road', 'Lighthouse', 'skip']) {
    const c = candidates.find(c => (c.move.region ? getRotatedRegions(s.currentTile!.label, c.move.rotation).find(r => r.id === c.move.region)?.type : 'skip') === kind);
    if (c && !pool.includes(c)) pool.push(c);
  }
  if (difficulty === 'hard' && o.nodes === undefined) {
    for (let round = 0; round < 24 && performance.now() < deadline; round++) {
      const deck = hypothetical(counts, (o.seed ?? 1) + round * 7919);
      const roundValues: number[] = [];
      for (const c of pool) {
        if (performance.now() > deadline) break;
        const g = Game.fromPublicSnapshot(s, deck); applyMove(g, c.move);
        const fastBase = utility(values(g, counts, false), me);
        for (let depth = 0; depth < s.players.length + 1 && g.state !== 'GAME_OVER' && performance.now() < deadline; depth++) {
          const view = g.publicSnapshot(), actor = view.currentIndex;
          let best: AiMove | undefined, bestValue = -Infinity;
          let replyCount = 0;
          for (const action of moves(view)) {
            if (replyCount++ >= 24 || performance.now() > deadline) break;
            const branch = Game.fromPublicSnapshot(view, [...g.deck]);
            if (!applyMove(branch, action)) continue;
            const v = utility(values(branch, remainingCounts(view), false), actor);
            if (v > bestValue) { bestValue = v; best = action; }
          }
          if (!best || !applyMove(g, best)) break;
        }
        roundValues.push(utility(values(g, remainingCounts(g.publicSnapshot()), false), me) - fastBase); samples++;
      }
      if (roundValues.length === pool.length && performance.now() <= deadline) {
        completedRounds++;
        pool.forEach((c, i) => { c.sum += roundValues[i]; c.visits++; });
      }
    }
    // Only compare candidates with a shared minimum number of observations.
    const min = Math.min(...pool.map(c => c.visits));
    if (min > 0) {
      // Sparse, shallow rollouts are noisy. Retain the tactical prior until evidence accumulates.
      const weight = 0.2 * Math.min(1, min / 4);
      for (const c of pool) c.value += weight * c.sum / c.visits;
      pool.sort((a, b) => b.value - a.value);
    }
  }
  const best = pool[0] ?? candidates[0];
  return { move: best?.move, evaluated, samples, elapsedMs: performance.now() - start, completedRounds, exhausted, value: best?.value ?? 0, model: 'inventory-bound + heuristic leaf; unknown order sampled' };
}
