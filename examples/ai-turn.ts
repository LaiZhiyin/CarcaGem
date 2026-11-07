import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Game } from '../src/engine/game.js';
import { applyMove, decide, type AiMove } from '../src/engine/ai/strategy.js';

interface Fixture {
  seed: number;
  decisionSeed: number;
  candidateLimit: number;
  setupMoves: AiMove[];
  expected: { tileId: number; move: AiMove; scores: number[]; scoreDelta: number };
}

const fixture = JSON.parse(readFileSync(new URL('./ai-turn.fixture.json', import.meta.url), 'utf8')) as Fixture;
const game = new Game([
  { name: 'Nemo', color: 'red', isAI: true, meepleImg: '', avatarImg: '' },
  { name: 'Ray', color: 'blue', isAI: true, meepleImg: '', avatarImg: '' },
], fixture.seed);
game.isOnline = false;
game.simulation = true;
game.start();
for (const move of fixture.setupMoves) assert.equal(applyMove(game, move), true, 'Fixture setup must obey the game rules');

const snapshot = game.publicSnapshot();
const originalSnapshot = structuredClone(snapshot);
const actorIndex = snapshot.currentIndex;
const scoresBefore = game.playerManager.players.map(player => player.score);
const input = {
  boardTiles: game.board.getAllTiles().length,
  currentTile: snapshot.currentTile!.id,
  remainingTiles: game.deck.length,
  player: snapshot.players[actorIndex].name,
  availableExplorers: snapshot.players[actorIndex].meeples,
};
assert.equal(input.currentTile, fixture.expected.tileId);
assert.equal('deck' in snapshot, false, 'The decision must not receive the hidden deck order');

// A fixed candidate cap makes this curated example reproducible across machines.
// Production also uses time-bounded sampled search; this example isolates its tactical path.
const decision = decide(snapshot, { nodes: fixture.candidateLimit, seed: fixture.decisionSeed, budgetMs: 60_000 });
assert.deepEqual(snapshot, originalSnapshot, 'Search must not mutate its input');
assert.deepEqual(decision.move, fixture.expected.move);
assert.equal(decision.evaluated, fixture.candidateLimit);
assert.ok(decision.move);
assert.equal(applyMove(game, decision.move), true, 'The engine must accept the chosen move');

const scores = game.playerManager.players.map(player => player.score);
const scoreDelta = scores[actorIndex] - scoresBefore[actorIndex];
assert.deepEqual(scores, fixture.expected.scores);
assert.equal(scoreDelta, fixture.expected.scoreDelta);
assert.equal(game.board.getAllTiles().length, input.boardTiles + 1);
assert.equal(game.deck.length, input.remainingTiles - 1);
assert.equal(game.playerManager.players[actorIndex].meeples, input.availableExplorers, 'The completed road returns its explorer');

process.stdout.write(JSON.stringify({
  input,
  decision: { evaluatedCandidates: decision.evaluated, move: decision.move },
  output: { acceptedByRules: true, boardTiles: game.board.getAllTiles().length, remainingTiles: game.deck.length,
    pointsAwarded: scoreDelta, scores, explorersAfter: game.playerManager.players[actorIndex].meeples,
    nextPlayer: game.playerManager.getCurrentPlayer().name },
}, null, 2) + '\n');
