/** Chess.com public API (read-only, no authentication). */
import type { ChesscomRatings } from './db/schema.js';
import { env } from './env.js';

const UA = 'prepa-cahier';

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
