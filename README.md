# e4e5

Build and learn chess opening repertoires, with Lichess statistics at your level.

**https://gab23r.github.io/e4e5/** — runs entirely in the browser (no account, no server): the
data stays on the device.

- Repertoires made of chapters, like Lichess studies (a study becomes a repertoire, each chapter
  a chapter): create them on the board, import PGN (variations kept) or Lichess studies, export
  to PGN, group chapters into repertoires.
- Lichess studies both ways (official API, with your Lichess account): update a repertoire from
  its study, chapter by chapter (your own additions kept), and push it to its study (created,
  private, if it has none).
- Library ("Bibliothèque"): openings explained move by move, like a Lichess study: a comment and
  arrows for each move, the variations under their line with where they fork, "Pourquoi ce coup ?"
  (the other moves there: played at your level, their score, Stockfish), a "Devine le coup" quiz,
  and "S'entraîner sur cette ouverture" (a repertoire of it, then its training). Lichess studies
  can be added to it and read the same way. The app's lessons are PGN in
  `apps/web/src/library/openings.ts` (comments `[fr] … [en] …`, arrows `[%cal]`, squares `[%csl]`).
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
packages/data   the app's data rules on SQLite (Drizzle) and its migrations (drizzle/)
apps/web        React + Vite + chessground; the data in SQLite (WASM) in the browser
tools/stats     opening statistics files built from the Lichess game database
```

## Development

```bash
pnpm install
pnpm dev              # web on http://localhost:5173
pnpm test
pnpm typecheck
```

In dev, the statistics files are downloaded from the project's GitHub Pages. The main commands
are also in the `justfile` (`just` lists them): `just check`, `just build-pages` (the GitHub
Pages build), …

After changing `packages/data/src/schema.ts`: `pnpm db:generate` writes the migration, replayed
by the app on each device's database at start.

There is no Lichess app to register: OAuth uses PKCE, and the client id is just a name.

## Installable app (PWA)

The web app can be installed on a phone or a computer (home screen icon, full screen):
Android/Chrome/Edge "Install app", iPhone Safari Share → "Sur l’écran d’accueil". Settings →
Application explains it to users (with an install button where the browser offers one).

- `apps/web/public/manifest.webmanifest`: name, colours, icons.
- `apps/web/public/sw.js`: service worker (production builds only). The app shell and the
  hashed `/assets/` are cached, so the app opens offline. Bump
  `VERSION` in it to drop every cache.
- Data (`apps/web/src/local/`): everything is on the device, in
  SQLite (WASM, origin private file system, one tab at a time), with the statistics files of
  the chosen rating buckets downloaded in Paramètres. Only Lichess and Chess.com (games,
  studies) need the network.
- Icons: `apps/web/scripts/icons/*.svg` → `apps/web/scripts/make-icons.sh` (rsvg-convert) →
  `apps/web/public/icons/` (committed).

Installing needs HTTPS (or localhost). To try it: `just build-pages`, then
`VITE_BASE=/e4e5/ pnpm --filter web exec vite preview` and open it in Chrome. DevTools → Application shows the manifest and the service worker.

## Mobile app (Capacitor)

The same web app, packaged with Capacitor (`apps/web/android`, `apps/web/ios`, app id
`com.e4e5`). Data in SQLite on the device,
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

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` builds the app (base `/<repository>/`) on every push to `main` that touches the app, adds the statistics files of the
latest `stats-YYYY-MM` release under `/stats/`, and publishes it at
https://gab23r.github.io/e4e5/. Locally: `just build-pages`.

## License

GPL-3.0-or-later (see `LICENSE`): Stockfish, chessground and chessops are GPL too.
