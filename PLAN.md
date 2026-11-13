# Mon cahier: plan

A web app to build and learn chess opening repertoires, shared with friends. Each user logs in
with their Lichess account.

## Decisions

| Topic | Decision |
|---|---|
| Users | Multi-user (friends). Username + password accounts (scrypt) and/or Login with Lichess (OAuth2 PKCE). A password account can link Lichess later. Guest login (name only) for testing, on by default in dev only |
| Chess.com | First-class for games and ratings (public API). Login with Chess.com needs an approved OAuth app: apply, and plug it in next to Lichess once approved. Until then Chess.com players use a password account and enter their Chess.com username in Settings |
| Stack | TypeScript monorepo (pnpm): React + Vite + chessground / Fastify / SQLite (Drizzle + libsql) |
| Chess logic | `chessops` in a shared `packages/core` (used by server and browser) |
| License | GPL-3.0 is acceptable (chessground, chessops) |
| Statistics | Always the **Lichess** explorer, clearly labelled "Lichess players rated X–Y". A slider picks the range, defaulting to the buckets around the user's Lichess rating. No automatic Chess.com→Lichess conversion: users know the gap and adjust the slider. Speed selector: blitz, rapid, or both |
| Deployment | One Docker container (API + static web), SQLite file on a volume |

## Data model

The repertoire is a **graph of positions** (FEN without move counters) linked by moves, so
transpositions merge. Any position may have several moves, including for the user's side
(several prepared answers are fine; training accepts any of them).

Position statistics live in `position_stats`: one row per (position, speeds, rating buckets),
shared by all users. It grows with every live Lichess request and with imported seeds
(`apps/server/seed/*.json.gz`, imported once per file at startup). The first seed comes from a
previous explorer cache: 2,578 positions, blitz+rapid+classical, 1600–1999. When live data cannot be
fetched (no token, rate limit, network), the closest stored combination is shown, labelled as such.

Tables: `users` (login + password hash, Lichess id/token/ratings, Chess.com username/ratings), `sessions`, `repertoires` (name, color),
`rep_moves` (from/to FEN, uci, san, comment, nags, isMain, source), `position_stats` and `seed_imports`.

Planned: `review_cards` (FSRS state per user move), `game_syncs`, `inbox_items`.

## Lichess integration

- OAuth: `/oauth` + `/api/token` (PKCE), then `/api/account` for username and ratings.
- Explorer: `explorer.lichess.ovh/lichess?fen&speeds&ratings`. The token is required. Requests
  are proxied by the server: one at a time across all users, a 60 s cooldown after a 429. Results
  are stored in `position_stats` and refreshed after 30 days.
- Games: `/api/games/user/{name}?since=…&perfType=blitz,rapid` as ndjson.

## Chess.com integration

- Public read-only API, no auth: `/pub/player/{u}/stats` (ratings), `/pub/player/{u}/games/archives`
  and `/pub/player/{u}/games/{YYYY}/{MM}` (games with PGN). Serial requests, or it answers 429.
- No position statistics / opening explorer in the API, so statistics come from Lichess.
- OAuth ("Sign in with Chess.com") exists for approved developers only.

## Phases

- [x] **0. Setup**: monorepo, configs, schema, Docker.
- [x] **1. Repertoire core**: graph, board editor, add/delete moves, main line, comments,
  PGN import (merge, orphans) and export. Unit tests in `packages/core`.
- [x] **3a. Lichess login + explorer overlay**: arrows (green = prepared, yellow = popular but
  not prepared, blue = prepared but rare), explorer table, speed selector.
- [x] **3b. Guest login + rating range slider**.
- [x] **3c. Accounts + Chess.com profile**: password accounts, link/unlink Lichess, Chess.com
  username and ratings in Settings, optional server-wide `LICHESS_APP_TOKEN` so users without a
  linked Lichess account still get statistics.
- [x] **3e. Stored position statistics**: `position_stats` table, initial seed,
  fallback to the closest stored range, import/export scripts.
- [ ] **3f. Grow the statistics**: background prefetch of repertoire positions (by reach
  probability) for the common ranges, and periodic seed exports.
- [ ] **3d. Chess.com OAuth**: apply for an app (once deployed publicly), then add "Login with Chess.com".
- [x] **2. Training v1**: one FSRS card (`ts-fsrs`) per position where it is the user's turn; any
  repertoire move there is accepted. Drill = replay of the line, then the question. New
  positions are shown with the answer first, then asked again after the learning steps. Up to
  N new positions per day and per repertoire, learnt line by line (main line first).
- [x] **2b. Training v2**: "Play lines" mode (the app plays the opponent, replies weighted by
  Lichess frequencies at the selected level; reviews recorded only for mistakes, new positions
  and due positions); "Train from here" (subtree); "Train all" repertoires; progress table and
  leeches (forgotten 3+ times) with links to the editor.
- [x] **2c. Statistics page**: repertoire known now (FSRS retrievability), learnt / well known /
  due, training streak and first-try accuracy, activity (30 days, from `review_log`), forecast
  (14 days), breakdown by line, weakest positions.
- [x] **4. Gap finder**: probability of reaching each position (product of opponent move
  frequencies; split equally between my answers when I have several). Main figure: the
  **expected preparation depth** (average number of moves a game stays in the lines, until an
  unprepared opponent move or the end of a line), per colour and per repertoire. All
  repertoires of one colour are analysed together (a line prepared in one is not a hole in
  another); each game's end of preparation goes to the repertoire following its line the
  furthest, past that repertoire's trunk (the line before its first choice). "Top holes" list,
  with a "prepare in…" menu of all repertoires of the colour, ranked by the same logic. Explores
  down to 0.01% of games on stored statistics; the cutoff (0.5–5%) only sets which holes are
  listed and which missing statistics the background queue fetches (deduplicated, waits out 429s).
- [x] **5. Game sync** (Lichess and Chess.com): background sync (Chess.com monthly archives one
  request at a time, from the month of the last synced game; Lichess ndjson export `since`),
  games stored in `games` (SAN moves), cursor in `game_syncs`. Each game is compared with all
  repertoires of its colour merged (transpositions followed) and given to the best suited
  repertoire (trunk logic), recomputed on demand. Games page: statistics per repertoire (games,
  score, moves in book) and outside the repertoires; inbox grouped by position (opponent
  novelties with my replies, my deviations, ends of lines), one click adds the line, "review
  now" makes the card due, dismiss (`inbox_dismissed`). Deviations of the last 14 days make
  their card due at sync time.
- [x] **6a. Engine + search**: Stockfish 19 lite (WASM worker, 3 lines, best-move arrow, click to
  play a line as a draft); search box (moves, FEN, comment text) with `/` shortcut.
- [x] **6b. Explorer page**: free board (flip, reset, ←/→, line kept in the URL), Stockfish, moves of all
  repertoires in the position (with links into each), Lichess players statistics or **my games**
  (Lichess player explorer, ndjson stream, indexing on demand; Chess.com games need phase 5),
  top / recent games, a click replays the game on the board.
- [ ] **6. Polish**: search/jump to position, mobile
  layout, PWA, sharing a repertoire with a friend (read-only link / copy).
- [x] **7. Hosting**: Fly.io app `mon-cahier` (https://mon-cahier.fly.dev), one machine in
  Paris, 1 GB encrypted volume with daily snapshots (5 days). Own domain later (mon-cahier.fr).

## Risks

- Explorer rate limits: shared cache, single queue, probability cutoffs.
- PGN edge cases (FEN-started chapters, transpositions): moves that cannot be reached from the
  initial position are skipped and reported.
