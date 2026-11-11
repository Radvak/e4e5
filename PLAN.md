# Prepa-cahier: plan

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
- [ ] **2. Training**: drill mode with FSRS (`ts-fsrs`). The app plays the opponent, choosing
  replies weighted by explorer frequency. Modes: due cards / one line / new lines.
- [ ] **4. Gap finder**: probability of reaching each position (product of opponent move
  frequencies), a "top holes" list, and a coverage score per repertoire. Explorer calls are
  bounded by a probability cutoff and run in a background queue.
- [ ] **5. Game sync** (Lichess and Chess.com): fetch new games (Chess.com: monthly archives
  `/pub/player/{u}/games/{YYYY}/{MM}`, one request at a time) and match each to the best repertoire
  (`bestRepertoire`), then classify with `analyzeGame`:
  - my deviation: schedule that card for early review
  - opponent novelty: inbox item; suggest my game reply, the most played reply, or the engine move
  - end of prep: offer to extend the line

  One click adds the line. Stats per line.
- [ ] **6. Polish**: Stockfish WASM, search/jump to position, mobile
  layout, PWA, sharing a repertoire with a friend (read-only link / copy).
- [ ] **7. Hosting**: deploy (Fly.io / Railway / VPS), backups of the SQLite file.

## Risks

- Explorer rate limits: shared cache, single queue, probability cutoffs.
- PGN edge cases (FEN-started chapters, transpositions): moves that cannot be reached from the
  initial position are skipped and reported.
