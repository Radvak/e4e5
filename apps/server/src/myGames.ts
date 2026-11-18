/**
 * Explorer "Mes parties": the user's own stored games (Lichess and Chess.com) in a position.
 *
 * The games are indexed once per user by position (the first MAX_PLY plies, so transpositions
 * meet): for each position, the games going through it and the move played there. The index is
 * kept until the user's games change (count / latest insert) or after a while without use.
 */
import { GameLine, type ExplorerResponse } from '@tabiya/core';
import { eq, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { games } from './db/schema.js';

type Game = typeof games.$inferSelect;
/** Positions indexed: the opening, where the explorer is used. */
export const MAX_PLY = 30;
const IDLE_MS = 10 * 60_000;
const RECENT = 8;

interface Index {
  signature: string;
  usedAt: number;
  games: Omit<Game, 'moves' | 'createdAt' | 'userId'>[];
  /** Moves played in the indexed positions (uci, san), by code. */
  moves: { uci: string; san: string }[];
  /** Position → games through it: game index × 2^16 + move code (0xffff: the game ended there). */
  at: Map<string, number[]>;
}
const ENDED = 0xffff;
const cache = new Map<string, Index>();

async function indexFor(userId: string): Promise<Index> {
  const [sig] = await db
    .select({ n: sql<number>`count(*)`, last: sql<number>`coalesce(max(${games.createdAt}), 0)` })
    .from(games)
    .where(eq(games.userId, userId));
  const signature = `${sig!.n}|${sig!.last}`;
  const hit = cache.get(userId);
  if (hit && hit.signature === signature) {
    hit.usedAt = Date.now();
    return hit;
  }
  const rows = await db.select().from(games).where(eq(games.userId, userId));
  const index: Index = { signature, usedAt: Date.now(), games: [], moves: [], at: new Map() };
  const codes = new Map<string, number>();
  const add = (fen: string, value: number) => {
    const list = index.at.get(fen);
    if (!list) index.at.set(fen, [value]);
    // Once per game (a position repeated in a game counts once, with its first move).
    else if (Math.floor(list.at(-1)! / 0x10000) !== Math.floor(value / 0x10000)) list.push(value);
  };
  for (let g = 0; g < rows.length; g++) {
    const { moves, createdAt: _c, userId: _u, ...game } = rows[g]!;
    index.games.push(game);
    const line = new GameLine(moves);
    let ply = 0;
    for (; ply < MAX_PLY; ply++) {
      const m = line.at(ply);
      if (!m) break;
      const key = `${m.uci} ${m.san}`;
      let code = codes.get(key);
      if (code === undefined) {
        code = index.moves.length;
        codes.set(key, code);
        index.moves.push({ uci: m.uci, san: m.san });
      }
      add(m.fromFen, g * 0x10000 + code);
    }
    // The game ended inside the indexed opening: it reached its last position too.
    const last = ply > 0 && ply < MAX_PLY ? line.at(ply - 1) : null;
    if (last && !line.at(ply)) add(last.toFen, g * 0x10000 + ENDED);
    // Do not block the server for long on large game collections.
    if (g % 500 === 499) await new Promise((r) => setImmediate(r));
  }
  cache.set(userId, index);
  return index;
}

// Forget the indexes not used for a while (memory of the small machine).
setInterval(() => {
  for (const [k, v] of cache) if (Date.now() - v.usedAt > IDLE_MS) cache.delete(k);
}, 60_000).unref();

export interface MyGamesQuery {
  fen: string;
  color: 'white' | 'black';
  speeds: string[];
  /** Games of the last `days` days (0: all). */
  days: number;
}

/** Move statistics (explorer format) and most recent games of the user in a position. */
export async function myGamesAt(userId: string, names: { lichess: string | null; chesscom: string | null }, q: MyGamesQuery) {
  const index = await indexFor(userId);
  const since = q.days ? Date.now() - q.days * 86_400_000 : 0;
  const data: ExplorerResponse = { white: 0, draws: 0, black: 0, moves: [] };
  const perMove = new Map<number, ExplorerResponse['moves'][number]>();
  const through: { game: Index['games'][number]; code: number }[] = [];
  for (const value of index.at.get(q.fen) ?? []) {
    const code = value % 0x10000;
    const game = index.games[Math.floor(value / 0x10000)]!;
    if (game.color !== q.color || !q.speeds.includes(game.speed) || game.playedAt.getTime() < since) continue;
    through.push({ game, code });
    const winner = game.result === 'draw' ? 'draws' : (game.result === 'win') === (game.color === 'white') ? 'white' : 'black';
    data[winner]++;
    if (code === ENDED) continue;
    let m = perMove.get(code);
    if (!m) perMove.set(code, (m = { ...index.moves[code]!, white: 0, draws: 0, black: 0 }));
    m[winner]++;
  }
  data.moves = [...perMove.values()].sort((a, b) => b.white + b.draws + b.black - (a.white + a.draws + a.black));
  const recentGames = through
    .sort((a, b) => b.game.playedAt.getTime() - a.game.playedAt.getTime())
    .slice(0, RECENT)
    .map(({ game: g, code }) => {
      const me = { name: (g.source === 'lichess' ? names.lichess : names.chesscom) ?? 'moi', rating: g.myRating };
      const opponent = { name: g.opponent, rating: g.opponentRating };
      return {
        id: g.id,
        source: g.source,
        url: g.url,
        winner: g.result === 'draw' ? null : (g.result === 'win') === (g.color === 'white') ? ('white' as const) : ('black' as const),
        speed: g.speed,
        white: g.color === 'white' ? me : opponent,
        black: g.color === 'white' ? opponent : me,
        month: g.playedAt.toISOString().slice(0, 7),
        uci: code === ENDED ? null : index.moves[code]!.uci,
      };
    });
  return { data, recentGames, maxPly: MAX_PLY };
}

/** The moves of one of the user's stored games (to replay it). */
export async function myGameMoves(userId: string, id: string): Promise<string[] | null> {
  const [row] = await db.select({ userId: games.userId, moves: games.moves }).from(games).where(eq(games.id, id));
  return row && row.userId === userId ? row.moves : null;
}
