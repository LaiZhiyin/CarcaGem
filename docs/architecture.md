# CarcaGem Architecture

CarcaGem is a TypeScript browser game with a React/Vite client and a Node.js service for multiplayer rooms and first-party analytics.

## Runtime overview

```text
Browser
  React UI ── game engine ── local play and AI
      │
      └── Socket.IO ── Express server ── online rooms and AI turns
                       ├── analytics API
                       └── SQLite analytics store
```

The browser can run local games without a server. Online rooms and analytics require the Node.js server. In development, Vite serves the client and proxies API and Socket.IO requests to the server. In production, the site proxy routes those requests to the private Node.js listener.

## Main areas

- `src/App.tsx` controls the home, setup, and game screens, browser navigation prompts, and AI turns.
- `src/components/` contains the React interface for setup, the board, player HUD, and modal dialogs.
- `src/data/tiles.ts` defines tile shapes, terrain regions, artwork paths, and tile counts.
- `src/engine/` implements board placement, feature connectivity, scoring, game state, and AI behavior.
- `src/network.ts` provides the browser Socket.IO client and room operations.
- `src/server.ts` hosts the multiplayer server and serves the production browser build.
- `src/analytics/` collects browser events and builds reports using a worker thread.
- `src/db/analytics.ts` and `src/analytics/store.ts` manage the SQLite analytics database.
- `public/` contains game art, the player guide, and the analytics dashboard.

## Local development

Run `npm run server` in one terminal and `npm run dev` in another. Analytics data is stored in `./data` unless `ANALYTICS_DATA_PATH` is set. The directory must be writable and persistent in production.

`npm run build` compiles the TypeScript client and server, then writes the browser output to `dist/` and the server output to `dist-server/`.
