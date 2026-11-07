# Contributions and attribution

## Personal ownership and AI assistance

**Jasmine Lai** led needs discovery, scope, UI design, code integration, server deployment, testing and iteration. She is a chemistry student using Codex as an AI coding tool.

Codex assisted with implementation, debugging and documentation. The claim is AI-assisted product engineering: Jasmine's direction, decisions, integration and validation, rather than manual authorship of every line.

| Area | Jasmine's ownership | Evidence |
| --- | --- | --- |
| Discovery and planning | Collect requests, choose scope and prioritize changes. | [PRD](PRD.md), inventory case in [README](../README.md) |
| Rules and AI | Specify representations and expected outcomes; integrate and evaluate implementation. | [Engine](../src/engine/), [example](../examples/ai-turn.ts) |
| UI | Direct visual experience, flow, mobile behavior and explanatory feedback. | [Components](../src/components/), [recordings](../README.md#desktop-gameplay) |
| Delivery | Operate the service, test and iterate after playtesting. | [Deployment](DEPLOYMENT.md), [validation](VALIDATION.md), [CI](../.github/workflows/verify.yml) |

The 20+ external players, 100+ playtest games and 10+ iterations come from Jasmine's account. No raw visitor records or private player conversations are published.

## Project implementation and dependencies

Repository-specific code covers tile definitions, feature traversal/scoring, turns, AI decisions, room actions, UI and analytics integration. Established tile-laying and majority-scoring mechanics are distinct from their software implementation.

| Dependency | Reviewed version | Declared license | Upstream |
| --- | --- | --- | --- |
| React / React DOM | 19.2.4 | MIT | [React](https://github.com/facebook/react) |
| Express | 5.2.1 | MIT | [Express](https://github.com/expressjs/express) |
| Socket.IO / client | 4.8.3 | MIT | [Socket.IO](https://github.com/socketio/socket.io) |
| better-sqlite3 | 12.8.0 | MIT | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Three.js | 0.186.1 | MIT | [Three.js](https://github.com/mrdoob/three.js) |
| qrcode | 1.5.4 | MIT | [node-qrcode](https://github.com/soldair/node-qrcode) |
| uuid | 13.0.0 | MIT | [uuid](https://github.com/uuidjs/uuid) |

Versions/licenses are from installed package metadata and the lockfile. Development dependencies retain their own licenses and notices; this table does not replace them.

## Code and media licensing status

No root project LICENSE has been declared. Public source availability and dependency licenses do not declare a license for the project-specific game code or media.

The GIF and inventory screenshot in `docs/media/` derive from the supplied CarcaGem desktop recording. Artwork remains in `public/`; a complete per-asset provenance and reuse-license register is not available. This documentation update asserts no new blanket media license.
