// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Game } from './src/engine/game';
import { TILES } from './src/data/tiles';
import { decide, remainingCounts, arrivalProbability, analyzeCompletion, applyMove } from './src/engine/ai/strategy';
const players = [{ name: 'A', color: 'red', isAI: true, meepleImg: '', avatarImg: '' }, { name: 'B', color: 'blue', isAI: false, meepleImg: '', avatarImg: '' }];
describe('AI shared rules and public information', () => {
  it('keeps hidden order out of snapshot and decision', () => {
    const g = new Game(players, 17526); g.isOnline = false; g.start();
    const a = g.publicSnapshot(); g.deck.reverse();
    expect(g.publicSnapshot()).toEqual(a);
    expect(a).not.toHaveProperty('deck'); expect(a).not.toHaveProperty('seed');
    expect(decide(a, { nodes: 5, seed: 42 }).move).toEqual(decide(g.publicSnapshot(), { nodes: 5, seed: 42 }).move);
  });
  it('counts 80 tiles including the starter without spending deferred tiles', () => {
    const g = new Game(players); g.currentTile = TILES[0]; g.state = 'PLACE_TILE';
    const counts = remainingCounts(g.publicSnapshot());
    expect(counts.reduce((a, b) => a + b, 0)).toBe(78); expect(counts[3]).toBe(4); expect(counts[0]).toBe(2);
  });
  it('computes without-replacement arrival probabilities', () => {
    expect(arrivalProbability(20, 3, 5)).toBeCloseTo(0.60087719298);
    expect(arrivalProbability(20, 0, 5)).toBe(0);
  });
  it('claims and immediately recycles the last available meeple on a closed road', () => {
    const g = new Game(players); g.currentTile = TILES[0]; g.state = 'PLACE_TILE';
    // Starting road at (0,0) ends on the new lighthouse to the left.
    const end = g.board.placeTile(1, 0, TILES[0], 90); void end;
    g.playerManager.players[0].meeples = 1;
    const result = decide(g.publicSnapshot(), { nodes: 300, seed: 1 });
    expect(result.move).toBeTruthy();
    const sim = Game.fromPublicSnapshot(g.publicSnapshot());
    expect(applyMove(sim, result.move!)).toBe(true);
    expect(sim.playerManager.players[0].score).toBeGreaterThan(0);
    expect(sim.playerManager.players[0].meeples).toBe(1);
  });
  it('restores complete scoring state and rewards on undo', () => {
    const g = new Game(players); g.start(); const before = g.publicSnapshot(); g.saveHistory();
    g.playerManager.extraTurns[1] = 3; g.undo();
    expect(g.publicSnapshot()).toEqual(before);
  });
  it('returns a legal fallback under a zero search budget without mutating input', () => {
    const g = new Game(players); g.start(); const s = g.publicSnapshot(); const before = structuredClone(s);
    const r = decide(s, { budgetMs: 0 }); expect(r.move).toBeTruthy(); expect(s).toEqual(before);
    expect(applyMove(Game.fromPublicSnapshot(s), r.move!)).toBe(true);
  });
  it('does not confuse lack of an immediate cap with structural impossibility', () => {
    const g = new Game(players); const tile = g.board.getTile(0, 0)!;
    const result = analyzeCompletion(g.board, tile, 'beach-0', TILES.map(t => t.quantity));
    expect(result.impossible).toBe(false); expect(result.slots).toBeGreaterThan(0);
  });
});

describe('inventory and closure constraints', () => {
  it('does not count multiple rotations as extra matching tiles', () => {
    const g = new Game(players); const counts = TILES.map(() => 0); counts[4] = 1;
    const a = analyzeCompletion(g.board, g.board.getTile(0, 0)!, 'beach-0', counts);
    expect(a.compatible).toEqual([1]); expect(a.impossible).toBe(false);
  });
  it('proves an unfillable fixed frontier impossible', () => {
    const g = new Game(players); const counts = TILES.map(() => 0); counts[17] = 4;
    expect(analyzeCompletion(g.board, g.board.getTile(0, 0)!, 'beach-0', counts).impossible).toBe(true);
  });
  it('detects two separate missing cells competing for one physical tile', () => {
    const g = new Game(players); g.board = new (g.board.constructor as typeof import('./src/engine/board').Board)();
    const t = g.board.placeTile(0, 0, TILES[5], 0); const counts = TILES.map(() => 0); counts[4] = 1;
    const a = analyzeCompletion(g.board, t, 'beach-0', counts);
    expect(a.slots).toBe(2); expect(a.compatible).toEqual([1, 1]); expect(a.impossible).toBe(true);
  });
  it('settles scored roads synchronously and makes terminal scoring idempotent', () => {
    const g = new Game(players); g.simulation = true;
    g.board.placeTile(1, 0, TILES[0], 90); g.currentTile = TILES[0]; g.state = 'PLACE_TILE';
    expect(applyMove(g, { x: -1, y: 0, rotation: 270, region: 'road-0' })).toBe(true);
    expect(g.playerManager.players[0].score).toBe(3);
    g.processFinalScoring(); const score = g.playerManager.players[0].score; g.processFinalScoring();
    expect(g.playerManager.players[0].score).toBe(score);
  });
  it('runs a complete two-AI game with nonnegative inventory and conserved meeples', () => {
    const g = new Game(players, 431); g.isOnline = false; g.simulation = true; g.start();
    for (let turn = 0; turn < 90 && g.state !== 'GAME_OVER'; turn++) {
      const r = decide(g.publicSnapshot(), { nodes: 12, seed: 1 }); expect(r.move).toBeTruthy();
      expect(applyMove(g, r.move!)).toBe(true);
      for (const p of g.playerManager.players) {
        const deployed = g.board.getAllTiles().filter(t => t.meeple?.playerId === p.id).length;
        expect(p.meeples + deployed).toBe(8);
      }
      expect(remainingCounts(g.publicSnapshot()).every(n => n >= 0)).toBe(true);
    }
    expect(g.state).toBe('GAME_OVER');
  });
});

describe('internal topology rather than four-edge matching', () => {
  it('distinguishes a cap from an extension even when both legally fit the frontier', () => {
    const g = new Game(players), t = g.board.getTile(0, 0)!;
    const caps = TILES.map(() => 0); caps[4] = 2;
    const extending = TILES.map(() => 0); extending[5] = 2;
    expect(analyzeCompletion(g.board, t, 'beach-0', caps).immediateCaps).toBe(2);
    const a = analyzeCompletion(g.board, t, 'beach-0', extending);
    expect(a.compatible[0]).toBe(2); expect(a.immediateCaps).toBe(0); expect(a.impossible).toBe(false);
  });
});

describe('bounded opponent-aware search', () => {
  it('completes paired search rounds rather than spending all hard-mode time at the root', () => {
    const g = new Game(players);g.currentTile=TILES[1];g.state='PLACE_TILE';
    const r=decide(g.publicSnapshot(),{difficulty:'hard',budgetMs:1200,seed:42});
    expect(r.completedRounds).toBeGreaterThan(0);
    expect(r.samples).toBeGreaterThan(1);
    expect(applyMove(Game.fromPublicSnapshot(g.publicSnapshot()),r.move!)).toBe(true);
  });
});
