# Lessons from building CarcaGem with AI assistance

I am Jasmine Lai, a chemistry student. I led CarcaGem's development and used Codex as an AI coding tool. These reflections are adapted and translated from my personal development notes; the links let you inspect the resulting models and tests.

## 1. Start with a checkable model

My useful starting point was a structured definition: 25 tile types, 80 physical tiles, edge/region properties and the draw–claim–score lifecycle. I learned that a detailed request still needs explicit boundaries and invariants.

These ideas are visible in the [tile data](../src/data/tiles.ts), [game states](../src/engine/game.ts) and [rules](rules.md). A specification becomes more useful when another person can tell whether the implementation follows it.

## 2. Repeated screenshots meant I needed a different approach

I initially sent screenshots of occupied regions still appearing claimable and asked for another correction. Repeated failures were frustrating because I could see the symptom without explaining the representation underneath it.

The turning point in my notes was specifying independent region identities and edge connections. I learned to take responsibility for the model even when AI helped write the code. The current [region IDs](../src/engine/regionId.ts), [connectivity/scoring](../src/engine/scoring.ts) and [validator](../src/engine/validator.ts) make that model inspectable.

I began looking for shared representation errors behind symptoms that I had previously treated as separate bugs.

## 3. Build an instrument when prose is not precise enough

My notes describe requesting a visual annotation tool for claimable positions, then temporarily displaying tile/region IDs and feature markers on the board. This helped separate an incorrect tile relationship from an error in traversal.

The original annotation/debug tools are not distributed in the current game. Their lasting result is explicit [coordinates and adjacency data](../src/data/tiles.ts). I learned to improve the feedback channel between myself and the code before requesting more edits.

## 4. Give a fix an expected result

For difficult scoring cases, I began writing board configurations and manually expected results before accepting another change. My attention shifted from whether a screen looked plausible to whether a rule had a reproducible consequence.

The repository now exposes [regression tests](../test_ai_upgrade.ts) and a [fixed AI-turn fixture](../examples/ai-turn.fixture.json). The fixture replays legal moves and checks a two-point award and explorer return. It is a curated example, not a performance sample.

## 5. Help players understand the result

My notes describe adding Latest Activity so a score change has an explanation. External players later requested remaining-tile counts and a stronger opponent. I treated these as information and decision-quality needs.

The [inventory panel](../src/components/RemainingTilesPanel.tsx) and [tests](../test_remaining_tiles.ts) show a complete loop: a player request, an explicit counting rule, an implementation and regression checks. Formal retention and human-AI win-rate measurements remain future work.

I now use a more demanding definition of done: explain the model, inspect the state, reproduce the behavior and understand what evidence is still missing.
