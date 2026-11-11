# Prepa-cahier: plan

A web app to build and learn chess opening repertoires, shared with friends. Each user logs in
with their Lichess account.

## Decisions

| Topic | Decision |
|---|---|
| Users | Multi-user (friends). Login with Lichess only (OAuth2 PKCE, no passwords) |
| Stack | TypeScript monorepo (pnpm): React + Vite + chessground / Fastify / SQLite (Drizzle + libsql) |
| Chess logic | `chessops` in a shared `packages/core` (used by server and browser) |
| License | GPL-3.0 is acceptable (chessground, chessops) |
| Lichess stats | Speed selector in the UI: blitz, rapid, or both. Rating buckets derived from the user's rating |
| Deployment | One Docker container (API + static web), SQLite file on a volume |

## Data model

The repertoire is a **graph of positions** (FEN without move counters) linked by moves, so
transpositions merge. At positions where it is the user's turn there should be exactly one
move. Several moves there are flagged as a "conflict".

Tables: `users` (Lichess id, token, ratings), `sessions`, `repertoires` (name, color),
`rep_moves` (from/to FEN, uci, san, comment, nags, isMain, source), and `explorer_cache`
(shared by all users).

Planned: `review_cards` (FSRS state per user move), `game_syncs`, `inbox_items`.

## Lichess integration

- OAuth: `/oauth` + `/api/token` (PKCE), then `/api/account` for username and ratings.
- Explorer: `explorer.lichess.ovh/lichess?fen&speeds&ratings`. The token is required. Requests
  are proxied by the server: one at a time across all users, a 60 s cooldown after a 429, and
  a 7-day shared cache.
- Games: `/api/games/user/{name}?since=…&perfType=blitz,rapid` as ndjson.

## Phases

- [x] **0. Setup**: monorepo, configs, schema, Docker.
- [x] **1. Repertoire core**: graph, board editor, add/delete moves, main line, comments,
  PGN import (merge, conflicts, orphans) and export. Unit tests in `packages/core`.
- [x] **3a. Lichess login + explorer overlay**: arrows (green = prepared, yellow = popular but
  not prepared, blue = prepared but rare), explorer table, speed selector.
- [ ] **2. Training**: drill mode with FSRS (`ts-fsrs`). The app plays the opponent, choosing
  replies weighted by explorer frequency. Modes: due cards / one line / new lines.
- [ ] **4. Gap finder**: probability of reaching each position (product of opponent move
  frequencies), a "top holes" list, and a coverage score per repertoire. Explorer calls are
  bounded by a probability cutoff and run in a background queue.
- [ ] **5. Game sync**: fetch new games and match each to the best repertoire
  (`bestRepertoire`), then classify with `analyzeGame`:
  - my deviation: schedule that card for early review
  - opponent novelty: inbox item; suggest my game reply, the most played reply, or the engine move
  - end of prep: offer to extend the line

  One click adds the line. Stats per line.
- [ ] **6. Polish**: Stockfish WASM, conflict resolver UI, search/jump to position, mobile
  layout, PWA, sharing a repertoire with a friend (read-only link / copy).
- [ ] **7. Hosting**: deploy (Fly.io / Railway / VPS), backups of the SQLite file.

## Risks

- Explorer rate limits: shared cache, single queue, probability cutoffs.
- PGN edge cases (FEN-started chapters, transpositions): moves that cannot be reached from the
  initial position are skipped and reported.
