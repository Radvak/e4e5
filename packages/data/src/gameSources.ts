/**
 * Where the user's games come from: the Chess.com public API (read-only, no authentication) and
 * the Lichess games export. Plain fetch, so it runs on the server and in the app: the server
 * passes its configured addresses and a User-Agent, the app the public addresses (no custom
 * header: a browser would then ask the site first, CORS preflight).
 */
import type { ChesscomRatings } from './schema.js';

export interface GameSources {
  chesscomApi: string;
  lichessHost: string;
  /** Lichess token (optional: the export of public games works without, a bit slower). */
  lichessToken?: string | null;
  /** Extra headers (the server's User-Agent). */
  headers?: Record<string, string>;
  /** Runs the lichess.org calls one at a time (Lichess answers 429 to a second one from the same address). */
  lichessQueue?: <T>(task: () => Promise<T>) => Promise<T>;
}

export const PUBLIC_SOURCES: GameSources = { chesscomApi: 'https://api.chess.com', lichessHost: 'https://lichess.org' };

export class ChesscomUserNotFound extends Error {}

interface StatsResponse {
  [key: string]: { last?: { rating: number } } | undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET on the Chess.com public API; on 429 waits a minute and tries again once (requests are serial). */
async function chesscomGet<T>(src: GameSources, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${src.chesscomApi}${path}`, { headers: { ...src.headers, Accept: 'application/json' } });
    if (res.status === 429 && attempt === 0) {
      await sleep(60_000);
      continue;
    }
    if (res.status === 404) throw new ChesscomUserNotFound(path);
    if (!res.ok) throw new Error(`Chess.com API ${res.status} on ${path}`);
    return (await res.json()) as T;
  }
}

const player = (username: string) => `/pub/player/${encodeURIComponent(username.toLowerCase())}`;

/** Current ratings of a Chess.com player; throws ChesscomUserNotFound on 404. */
export async function chesscomRatings(src: GameSources, username: string): Promise<ChesscomRatings> {
  const stats = await chesscomGet<StatsResponse>(src, `${player(username)}/stats`);
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

/** Months with games, oldest first, as "YYYY/MM". */
export async function chesscomArchives(src: GameSources, username: string): Promise<string[]> {
  const { archives } = await chesscomGet<{ archives: string[] }>(src, `${player(username)}/games/archives`);
  return archives.map((url) => url.split('/games/')[1]!).filter((m) => /^\d{4}\/\d{2}$/.test(m));
}

export async function chesscomMonth(src: GameSources, username: string, month: string): Promise<ChesscomGame[]> {
  const { games } = await chesscomGet<{ games: ChesscomGame[] }>(src, `${player(username)}/games/${month}`);
  return games;
}

/** A game of the Lichess games export (only the fields used). */
export interface LichessGameExport {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  players: { white: { user?: { name: string; id: string }; rating?: number }; black: { user?: { name: string; id: string }; rating?: number } };
  winner?: 'white' | 'black';
  moves: string;
  initialFen?: string;
}

/** Games of a Lichess user played since `since` (ms), oldest first. */
export async function lichessUserGames(src: GameSources, username: string, since: number | null): Promise<LichessGameExport[]> {
  const params = new URLSearchParams({
    moves: 'true',
    clocks: 'false',
    evals: 'false',
    opening: 'false',
    sort: 'dateAsc',
    perfType: 'ultraBullet,bullet,blitz,rapid,classical,correspondence',
    ...(since ? { since: String(since + 1) } : {}),
  });
  const call = async () => {
    const res = await fetch(`${src.lichessHost}/api/games/user/${encodeURIComponent(username)}?${params}`, {
      headers: { ...src.headers, Accept: 'application/x-ndjson', ...(src.lichessToken ? { Authorization: `Bearer ${src.lichessToken}` } : {}) },
    });
    if (!res.ok) throw new Error(`Lichess games export ${res.status}`);
    return res.text();
  };
  return (await (src.lichessQueue ? src.lichessQueue(call) : call()))
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as LichessGameExport);
}
