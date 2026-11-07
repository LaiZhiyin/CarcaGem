# Product brief

**Owner:** Jasmine Lai · **Product:** CarcaGem · **Current release:** v1.0.4

## User need

CarcaGem serves casual strategy players who use phones or computers and want to play with AI or friends. The initial hypothesis is that installation, learning a rulebook and finding an opponent create friction. This hypothesis is separate from the specific requests collected in playtesting.

Jasmine reports 20+ external playtesters, 100+ games involving external players and at least 30 iterations. These are owner-reported records, not a published research dataset.

## Scope and acceptance

| Need | Response | Acceptance evidence |
| --- | --- | --- |
| Start without coordinating a group. | Local human/AI seats and ocean-animal identities. | [Setup/AI input tests](../test_ai_input.ts) |
| Understand moves and points. | Placement highlights, automatic scoring and Latest Activity. | [Rules](rules.md), [engine](../src/engine/game.ts) |
| Plan around remaining inventory. | Player-requested panel with 25 types in local and online play. | [Inventory tests](../test_remaining_tiles.ts) |
| Play across devices. | Five-digit room codes, readiness, unique colors and validated actions. | [Room start](../test_network_start.ts), [synchronization](../test_online_bonus_sync.ts) |
| Improve the opponent. | Shared bounded policy, workers and visible thinking time. | [Search](../src/engine/ai/strategy.ts), [pacing](../test_ai_pacing.ts) |

Inventory counts exclude the tile in hand and placed tiles, retain zero-count types, update after a move/undo and restore focus on close.

## Decisions and deferred work

A single production AI policy aligns browser and server behavior and removes a difficulty choice from onboarding. Bounded search limits resource use and planning depth. Local undo supports experimentation; online actions remain authoritative.

Rooms live in server memory. This keeps the service simple but does not recover games after a restart. Accounts, durable recovery, ranked matchmaking and payments are outside the current scope. A commercial model has not been validated; the present product goal is better comprehension and repeat play.

## Next validation

Run a documented session with new players: measure first-legal-move time, requests for help, inventory-panel use and game completion. A proposed target is a first legal move within 90 seconds without help; it is not an achieved metric.

Before reporting a human win rate, run a seat-balanced evaluation and record opponent experience, policy and outcomes. Measure completion and repeat play before prioritizing monetization.
