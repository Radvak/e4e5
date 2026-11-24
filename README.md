# e4e5

Build and learn chess opening repertoires, with Lichess statistics at your level.

**https://gab23r.github.io/e4e5/** — runs entirely in the browser (no account, no server): the
data stays on the device.

- Repertoires: create them on the board, import PGN (variations kept) or Lichess studies, export
  to PGN.
- Training: spaced repetition (FSRS) on the positions of your repertoires ("Réviser"), and
  "Se tester" where the opponent plays the replies Lichess players of your level play.
- Gap finder ("Lacunes"): the frequent opponent moves your repertoires do not answer, and how deep
  each line goes.
- Explorer: what Lichess players of a chosen rating range play, the best moves at your level over
  the likely lines, Stockfish, and your own games.
- Your games: synced from Lichess and Chess.com, compared with your repertoires (where you or the
  opponent left them).
- Works offline once opened; installable on a phone (PWA), and as an Android / iOS app.

## Stack

pnpm monorepo, TypeScript everywhere.

```
packages/core   pure chess logic (chessops): repertoire graph, PGN, FSRS, gap finder, search at your level
packages/data   the app's data rules on SQLite (Drizzle), shared by the browser and the server
apps/web        React + Vite + chessground; local mode: SQLite (WASM) in the browser
apps/server     optional Fastify server (accounts, the same data on a server); self-hosted with Docker
tools/stats     opening statistics files built from the Lichess game database
```

## Development

```bash
pnpm install
cp .env.example .env
pnpm dev              # web on http://localhost:5173 (and the server on :3000)
pnpm test
pnpm typecheck
```

Open http://localhost:5173/?local=1 for the version without a server (as on GitHub Pages);
`?local=0` goes back to the server. The main commands are also in the `justfile` (`just` lists
them): `just check`, `just build-pages` (the GitHub Pages build), …

There is no Lichess app to register: OAuth uses PKCE, and the client id is just a name.

## Installable app (PWA)

The web app can be installed on a phone or a computer (home screen icon, full screen):
Android/Chrome/Edge "Install app", iPhone Safari Share → "Sur l’écran d’accueil". Settings →
Application explains it to users (with an install button where the browser offers one).

- `apps/web/public/manifest.webmanifest`: name, colours, icons.
- `apps/web/public/sw.js`: service worker (production builds only). The app shell and the
  hashed `/assets/` are cached, so the app opens offline; `/api/` is never cached by it. Bump
  `VERSION` in it to drop every cache.
- Local mode (GitHub Pages, mobile app; `apps/web/src/local/`): everything is on the device, in
  SQLite (WASM, origin private file system, one tab at a time), with the statistics files of
  the chosen rating buckets downloaded in Paramètres. Only Lichess and Chess.com (games,
  studies) need the network.
- With the server (`apps/web/src/offline/`): the data the app needs is kept in IndexedDB, for 20
  days and until the next build. Training works offline: each answer is scheduled on the device
  (FSRS in `packages/core/src/fsrs.ts`) and queued, then sent in order when the server can be
  reached, with its own id (counted once) and its time (the server computes the same card).
  Changes to repertoires need the network.
- Icons: `apps/web/scripts/icons/*.svg` → `apps/web/scripts/make-icons.sh` (rsvg-convert) →
  `apps/web/public/icons/` (committed).

Installing needs HTTPS (or localhost). To try it: `just build-pages`, then
`VITE_BASE=/e4e5/ pnpm --filter web exec vite preview` and open it in Chrome. DevTools → Application shows the manifest and the service worker.

## Mobile app (Capacitor)

The same web app, packaged with Capacitor (`apps/web/android`, `apps/web/ios`, app id
`com.e4e5`). It runs in local mode only, without the server: data in SQLite on the device,
games straight from Lichess and Chess.com (native HTTP, no CORS), statistics from the files per
rating bucket downloaded in Paramètres, Lichess linked by OAuth through
`com.e4e5://lichess-callback`. iOS 16.4 at least; Android 7 (API 24).

```bash
pnpm --filter web build:native   # web build, copied into android/ and ios/
pnpm --filter web android:apk                                    # android/app/build/outputs/apk/debug/app-debug.apk
```

Needs a JDK 21 and the Android SDK (platform 36, build-tools) with `ANDROID_HOME` set, or
Android Studio (`npx cap open android`); Xcode for iOS (`npx cap open ios`). The app downloads
the statistics files from the project's GitHub Pages (`VITE_STATS_URL` to change it; CORS needed,
the download runs in a worker).

## Opening statistics files

`tools/stats` builds the statistics of one month of the Lichess game database
(database.lichess.org, streamed: nothing written but the result) and splits them per rating
bucket for the app. GitHub Actions does it (`.github/workflows/stats.yml`: by hand, or the 8th of
each month for last month), keeps the files in a release `stats-YYYY-MM`, and `pages.yml`
publishes the latest one on GitHub Pages under `/stats/`.

```bash
pnpm --filter stats build-stats 2026-10 --out stats.db [--max-games N]   # needs zstd
pnpm --filter stats split --in stats.db --out stats-files [--min 50]
```

## Position statistics on the server

The server never asks Lichess: statistics come from the game database file (`STATS_DB`, built by
`tools/stats`) and, for the positions not in it, from the `position_stats` table (explorer answers
stored before, imports and seeds; the closest rating range when the exact one is missing).
Bundled seeds (`apps/server/seed/*.json.gz`) are imported at startup, once per file.

```bash
pnpm --filter server stats:import path/to/explorer-cache.json   # explorer cache or seed file
pnpm --filter server stats:export-seed my-seed-name                   # table -> seed/my-seed-name.json.gz
```

## Deployment

### GitHub Pages (the app)

`.github/workflows/pages.yml` builds the app without a server (`VITE_SERVERLESS=1`, base
`/<repository>/`) on every push to `main` that touches the app, adds the statistics files of the
latest `stats-YYYY-MM` release under `/stats/`, and publishes it at
https://gab23r.github.io/e4e5/. Locally: `just build-pages`.

### Self-hosted server (optional)

The server also serves the built web app, as a single container with the SQLite file on a volume
at `/data`:

```bash
docker build -t e4e5 .
docker run -p 3000:3000 -v e4e5-data:/data \
  -e PUBLIC_URL=https://your.domain -e COOKIE_SECRET=$(openssl rand -hex 32) e4e5
```

On a corporate network (TLS proxy, npm mirror), pass them as build secrets (not kept in the
image): `--secret id=ca,src=$NODE_EXTRA_CA_CERTS --secret id=npmrc,src=<npmrc with registry=...>`.

## License

GPL-3.0-or-later (see `LICENSE`): Stockfish, chessground and chessops are GPL too.
