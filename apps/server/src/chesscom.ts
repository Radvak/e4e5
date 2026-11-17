/** Chess.com public API (read-only, no authentication). */
import type { ChesscomRatings } from './db/schema.js';
import { env } from './env.js';

const UA = 'tabiya';

export class ChesscomUserNotFound extends Error {}

interface StatsResponse {
  [key: string]: { last?: { rating: number } } | undefined;
}

/** Current ratings of a Chess.com player; throws ChesscomUserNotFound on 404. */
export async function chesscomRatings(username: string): Promise<ChesscomRatings> {
  const res = await fetch(`${env.chesscomApi}/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (res.status === 404) throw new ChesscomUserNotFound(username);
  if (!res.ok) throw new Error(`Chess.com API ${res.status}`);
  const stats = (await res.json()) as StatsResponse;
  const ratings: ChesscomRatings = {};
  for (const speed of ['rapid', 'blitz', 'bullet', 'daily'] as const) {
    const rating = stats[`chess_${speed}`]?.last?.rating;
    if (rating) ratings[speed] = rating;
  }
  return ratings;
}

/** A game of a Chess.com monthly archive (only the fields used). */
export interface ChesscomGame {
  uuid: string;
  url: string;
  pgn?: string;
  end_time: number;
  rated: boolean;
  rules: string;
  time_class: string;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET on the public API; on 429 waits a minute and tries again once (requests are serial). */
async function chesscomGet<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${env.chesscomApi}${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 429 && attempt === 0) {
      await sleep(60_000);
      continue;
    }
    if (res.status === 404) throw new ChesscomUserNotFound(path);
    if (!res.ok) throw new Error(`Chess.com API ${res.status} on ${path}`);
    return (await res.json()) as T;
  }
}

/** Months with games, oldest first, as "YYYY/MM". */
export async function chesscomArchives(username: string): Promise<string[]> {
  const { archives } = await chesscomGet<{ archives: string[] }>(`/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`);
  return archives.map((url) => url.split('/games/')[1]!).filter((m) => /^\d{4}\/\d{2}$/.test(m));
}

export async function chesscomMonth(username: string, month: string): Promise<ChesscomGame[]> {
  const { games } = await chesscomGet<{ games: ChesscomGame[] }>(`/pub/player/${encodeURIComponent(username.toLowerCase())}/games/${month}`);
  return games;
}
