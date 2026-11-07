# Validation report

**Reviewed:** November 7, 2026 · **Game release:** v1.0.4

This report separates executable evidence, owner-reported playtesting and open questions. [Machine-readable evidence](evidence/validation.json) records local checks and a [successful clean Ubuntu verification](https://github.com/laizhiyin/carcagem/actions/runs/42374957596). Latest runs appear in the [Verification workflow](https://github.com/laizhiyin/carcagem/actions/workflows/verify.yml).

## Reproduce

Use Node.js 24 and the committed `package-lock.json`.

```sh
npm ci
npm run verify
```

Verification compiles the backend before socket tests, type-checks/builds the client, runs tests with at most two file workers, executes the fixed example and audits public assets. It needs no cloud credentials or live player data. Original LFS videos are optional.

## Methods and results

| Check | Sample and result | Boundary |
| --- | --- | --- |
| Vitest | 65 tests in 11 files pass. | Enumerated behavior, not exhaustive correctness. |
| Fixed AI turn | Seed 17526; four legal setup moves; 48 candidates; tile 20 placed at `(0,2)` with a road claim. | Two points, explorer return, inventory 74 → 73 and unchanged search input are asserted. |
| TypeScript / Vite | Client and server compile. | A build, not a load/performance test. |
| Asset audit | Runtime, dynamic-avatar and published documentation references are checked. | Missing/unreferenced public assets fail; OS metadata is excluded. |
| Hosted entry point | HTTPS homepage returned HTTP 200 during this review. | Point-in-time reachability, not sustained uptime or full room reliability. |

Targeted reproduction:

```sh
npx vitest run test_ai_upgrade.ts
npx vitest run test_remaining_tiles.ts
npm run build:server
npx vitest run test_network_start.ts test_online_bonus_sync.ts
npm run demo
```

The example is curated. Its candidate cap disables the production policy's sampled rollouts for deterministic output; it does not measure playing strength. Production deadlines are best-effort rather than strict real-time limits.

## Failure cases represented in tests

- Reversing the hidden deck does not change the public snapshot or a fixed-candidate decision.
- Zero search budget still produces a legal fallback without mutating the input.
- Separate frontier cells cannot both consume the same physical tile; edge fit alone does not prove closure.
- Final scoring is idempotent. A full simulated game checks nonnegative inventory and conservation of eight explorers per player.
- Room tests check host start, bot authority, three-player progression and extra-turn synchronization.
- Inventory tests check draw exclusion, turn/undo updates, zero-count types, keyboard isolation and focus return.

No coverage percentage, formal accessibility certification or adversarial security audit has been measured.

## AI and user evidence

The opponent combines rules, inventory constraints, heuristics and sampled search. The bundled [calibration artifact](AI_CALIBRATION.json) reports Brier scores of 0.18655 for its estimates and 0.24905 for a constant baseline, using 2,210 held-out feature observations from 40 seed groups. These are bundled synthetic-policy results, not a fresh human-strength evaluation. Observations within a game are related; unsupported bins use a heuristic fallback.

Jasmine reports that the improved AI outplays most humans encountered in playtesting. No controlled, seat-balanced human trial or public match-level dataset was supplied, so this is a qualitative observation rather than a measured win rate.

The 20+ external players, 100+ games and 10+ iterations are owner-reported. Analytics implementation is not independent proof of those counts.

## Current limitations and CI scope

Whole-repository ESLint has **41 errors and 1 warning**. The executable example is linted strictly; existing repository lint is an informational CI step until this debt is resolved. Passing Verification means the stated build/test/example/asset gates passed.

The local build reports a 545.94 kB minified 3D prototype chunk. Rooms are in-memory and do not recover after restart. Browser coverage, sustained uptime, retention, human-AI fairness and load limits need further measurement.

The next studies should measure first-move usability and seat-balanced human/AI outcomes under recorded conditions.
