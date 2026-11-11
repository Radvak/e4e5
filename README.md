# Prepa-cahier

Build and learn chess opening repertoires, with Lichess statistics at your level.

- Import PGN (variations kept), add and edit lines on the board, and export to PGN.
- Log in with Lichess: arrows show what players of your rating play (blitz, rapid, or both).
- Coming next: training (spaced repetition), gap finder, and growing your repertoire from your Lichess games. See [PLAN.md](PLAN.md).

## Stack

pnpm monorepo, TypeScript everywhere.

```
packages/core   pure chess logic (chessops): repertoire graph, PGN import/export, game analysis
apps/server     Fastify API: Lichess OAuth login, repertoires, explorer proxy (SQLite via Drizzle/libsql)
apps/web        React + Vite + chessground
```

## Development

```bash
pnpm install
cp .env.example .env
pnpm db:generate      # after changing apps/server/src/db/schema.ts
pnpm dev              # server on :3000, web on http://localhost:5173
pnpm test
pnpm typecheck
```

There is no Lichess app to register: OAuth uses PKCE, and the client id is just a name.

## Deployment

The app runs as a single container. The server also serves the built web app.

```bash
docker build -t prepa-cahier .
docker run -p 3000:3000 -v prepa-cahier-data:/data \
  -e PUBLIC_URL=https://your.domain -e COOKIE_SECRET=$(openssl rand -hex 32) prepa-cahier
```
