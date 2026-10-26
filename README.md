# Playroom

A small multiplayer parlor for Connect 4, chess, and Ribbon Rally. One Node process serves the site and the rooms, which is the shape Render and a single cloud VM expect.

## Games

- **Connect 4** — 7 columns by 6 rows, two seats, or you against the CPU.
- **Chess** — full rules, move list, promotion, and optional 5+0 or 10+0 clocks. CPU has Easy and Medium.
- **Ribbon Rally** — up to eight drivers. A mouse follows without a click; a finger follows while it is down. The name rides above the car, and the colored ribbon fades after 3.5 seconds.

Rooms use a short code. Chess and Connect 4 keep two seats; anyone else with the code watches the board and the move list. Ribbon Rally gives a car until the floor is full, then extra people watch.

The CPU runs in the seated player's browser and submits ordinary moves. The server still checks every move. That keeps a small Render instance as a router instead of a chess engine, and watchers see the same game.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. The API listens on port 3000 and Vite proxies the socket.

```bash
npm test
npm run test:e2e
npm run qa
```

`npm run qa` writes `qa-report.md`.

## Deploy

Render: new Web Service from this repo, using `render.yaml`, or set the build to `npm ci && npm run build` and the start to `npm start`. Set `NODE_ENV=production`. Use one instance. Rooms live in memory, so a second instance would not see them, and a restart clears open tables. The starter plan stays awake; the free plan sleeps and drops live games.

Any other host can run the Docker image. It listens on `PORT` or 3000.

```bash
docker build -t playroom .
docker run -p 3000:3000 -e NODE_ENV=production playroom
```

## Add a game

1. Add the rules under `src/shared` and a card in `src/shared/catalog.ts`.
2. Teach `src/server/rooms.ts` how to create the state and apply a move.
3. Add a view under `src/client/games` and register it in `src/client/ui/Room.tsx`.
4. Cover the rules with a vitest file. The server rejects anything the client skips.
