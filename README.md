# CarcaGem

CarcaGem is a strategic tile-laying game set on a vivid island. Place landscape tiles to connect beaches, boardwalks, roads, and seas, then send ocean-animal explorers to claim features and score points. Play solo against AI, pass-and-play locally, or invite friends into an online room.

Read the [Player Guide](https://carcagem.online/player-guide.html) to learn setup, turns, scoring, sea expansion, treasures, and strategy.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run locally

```sh
npm install
npm run server
```

In a second terminal, start the web client:

```sh
npm run dev
```

Open the local Vite URL shown in the terminal. The development client uses `http://localhost:3001` for multiplayer and analytics APIs. The server stores analytics data in `./data` by default; set `ANALYTICS_DATA_PATH` to choose another writable directory.

The admin dashboard signs in without a password when neither `ANALYTICS_ADMIN_PASSWORD` nor `ANALYTICS_ADMIN_TOKEN` is set. Anyone who can reach a deployment in this mode can view its analytics and manage campaigns. Set `ANALYTICS_ADMIN_PASSWORD` on a public deployment to require a password.

To build both the browser app and server, run `npm run build`. To run the production server locally after building, use `npm start`.

## Project commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development client |
| `npm run server` | Build and run the local multiplayer/API server |
| `npm run build` | Build the browser app and server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite |
| `npm run check:assets` | Check that referenced game assets exist |

## Current release

The current release is **v1.0.4**. The home screen version badge and page metadata are generated from the current `package.json` version during build.

## Documentation

- [Game rules](docs/rules.md)
- [Architecture](docs/architecture.md)
- [Server deployment](docs/DEPLOYMENT.md)

## Contact

For project questions, email [jasminelai@foxmail.com](mailto:jasminelai@foxmail.com).
