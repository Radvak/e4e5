# Tabiya

Build and learn chess opening repertoires, with Lichess statistics at your level.

- Import PGN (variations kept), add and edit lines on the board, and export to PGN.
- Log in with Lichess or a username/password, and link a Chess.com username.
- Arrows show what Lichess players of a chosen rating range play (blitz, rapid, or both).
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

The main commands are also in the `justfile` (`just` lists them): `just check`, `just deploy`
(local image build, push, Fly deploy), `just logs`, `just backup` (database copy to `backups/`), …

There is no Lichess app to register: OAuth uses PKCE, and the client id is just a name.
Set `LICHESS_APP_TOKEN` (see `.env.example`) so users without a linked Lichess account get statistics.

## Installable app (PWA)

The web app can be installed on a phone or a computer (home screen icon, full screen):
Android/Chrome/Edge "Install app", iPhone Safari Share → "Sur l’écran d’accueil". Settings →
Application explains it to users (with an install button where the browser offers one).

- `apps/web/public/manifest.webmanifest`: name, colours, icons.
- `apps/web/public/sw.js`: service worker (production builds only). The app shell and the
  hashed `/assets/` are cached, so the app opens offline; `/api/` is never cached (without
  network the app says so and reloads when the connection is back). Bump `VERSION` in it to
  drop every cache.
- Icons: `apps/web/scripts/icons/*.svg` → `apps/web/scripts/make-icons.sh` (rsvg-convert) →
  `apps/web/public/icons/` (committed).

Installing needs HTTPS (or localhost). To try it: `pnpm --filter web build`, run the server, open
it in Chrome. DevTools → Application shows the manifest and the service worker.

## Position statistics

Lichess explorer answers are stored in the `position_stats` table and reused by every user.
Bundled seeds (`apps/server/seed/*.json.gz`) are imported at startup, once per file.

```bash
pnpm --filter server stats:import path/to/explorer-cache.json   # explorer cache or seed file
pnpm --filter server stats:export-seed my-seed-name                   # table -> seed/my-seed-name.json.gz
```

## Deployment

The app runs as a single container (the server also serves the built web app), with the SQLite
file on a volume at `/data`.

### Fly.io

`fly.toml` describes one machine in Paris (`cdg`) with a 1 GB volume. First time:

```bash
fly auth login
fly apps create tabiya
fly volumes create data --region cdg --size 1
fly secrets set COOKIE_SECRET=$(openssl rand -hex 32)
# optional: statistics for users without a linked Lichess account
fly secrets set LICHESS_APP_TOKEN=lip_...
fly deploy
```

It is then at https://tabiya.fly.dev. Then `fly deploy` for each new version. Fly keeps daily snapshots of the volume (5 days); a copy
of the database: `fly ssh sftp get /data/tabiya.db`.

Where Fly's remote builder cannot be reached (corporate TLS proxy), build locally for Fly's
x86 machines and deploy the image:

```bash
TAG=registry.fly.io/tabiya:$(git rev-parse --short HEAD)
docker build --platform linux/amd64 --secret id=ca,src=$NODE_EXTRA_CA_CERTS --secret id=npmrc,src=<npmrc> -t $TAG .
fly auth docker && docker push $TAG
fly deploy --image $TAG
```

Own domain (e.g. tabiya.fr): `fly certs add tabiya.fr`, add the DNS records it prints at
the registrar, then set `PUBLIC_URL = "https://tabiya.fr"` in `fly.toml` (session cookies and
the Lichess login redirect use it) and `fly deploy`.

### Any Docker host

```bash
docker build -t tabiya .
docker run -p 3000:3000 -v tabiya-data:/data \
  -e PUBLIC_URL=https://your.domain -e COOKIE_SECRET=$(openssl rand -hex 32) tabiya
```

On a corporate network (TLS proxy, npm mirror), pass them as build secrets (not kept in the
image): `--secret id=ca,src=$NODE_EXTRA_CA_CERTS --secret id=npmrc,src=<npmrc with registry=...>`.
