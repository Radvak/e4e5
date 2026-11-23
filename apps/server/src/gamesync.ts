/**
 * Game sync: imports the user's games from Lichess and Chess.com into the `games` table, in the
 * background (one job per user and source), newest games only after the first sync.
 */
import { gameMovesFromPgn } from '@tabiya/core';
import { and, eq, gte } from 'drizzle-orm';
import { chesscomArchives, chesscomMonth, type ChesscomGame } from './chesscom.js';
import { db } from './db/client.js';
import { games, gameSyncs, type User } from './db/schema.js';
import { env } from './env.js';
import { analyseGames, loadRepertoires } from './gameAnalysis.js';
import { lichessUserGames, type LichessGameExport } from './lichess.js';
import { makeDue } from '@tabiya/data';

export type Source = 'lichess' | 'chesscom';
type GameRow = typeof games.$inferInsert;

export interface SyncJob {
  source: Source;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  /** Games read from the site / new games stored. */
  fetched: number;
  added: number;
  /** Chess.com: monthly archives done / to do. */
  progress?: { done: number; total: number };
  /** Positions made due for review because of a recent deviation. */
  reviews?: number;
  error?: string;
}

const jobs = new Map<string, SyncJob>();
const jobKey = (userId: string, source: Source) => `${userId}|${source}`;

export function syncJobs(userId: string): SyncJob[] {
  return (['chesscom', 'lichess'] as const).flatMap((s) => jobs.get(jobKey(userId, s)) ?? []);
}

/** Starts a sync unless one is running; returns the job. */
export function startSync(user: User, source: Source, log: { warn: (o: object, m: string) => void }): SyncJob {
  const key = jobKey(user.id, source);
  const running = jobs.get(key);
  if (running?.status === 'running') return running;
  const job: SyncJob = { source, status: 'running', startedAt: new Date().toISOString(), fetched: 0, added: 0 };
  jobs.set(key, job);
  const run = source === 'chesscom' ? syncChesscom(user, job) : syncLichess(user, job);
  run
    .then(() => scheduleDeviations(user.id, job))
    .then(() => void (job.status = 'done'))
    .catch((e: Error) => {
      log.warn({ err: e }, `${source} sync failed`);
      job.status = 'error';
      job.error = e.message;
    });
  return job;
}

async function syncState(userId: string, source: Source, account: string) {
  const [row] = await db.select().from(gameSyncs).where(and(eq(gameSyncs.userId, userId), eq(gameSyncs.source, source)));
  // Another account: start over.
  return row && row.account === account ? row.lastGameAt : null;
}

/** Stores new games and moves the sync cursor to the newest one. */
export async function store(userId: string, source: Source, account: string, rows: GameRow[], job: SyncJob, lastGameAt: Date | null) {
  job.fetched += rows.length;
  for (let i = 0; i < rows.length; i += 200) {
    const inserted = await db.insert(games).values(rows.slice(i, i + 200)).onConflictDoNothing().returning({ id: games.id });
    job.added += inserted.length;
  }
  const newest = rows.reduce<Date | null>((d, r) => (!d || r.playedAt > d ? r.playedAt : d), lastGameAt);
  const state = { account, lastGameAt: newest, syncedAt: new Date() };
  await db
    .insert(gameSyncs)
    .values({ userId, source, ...state })
    .onConflictDoUpdate({ target: [gameSyncs.userId, gameSyncs.source], set: state });
  return newest;
}

const CHESSCOM_DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

export function fromChesscom(userId: string, account: string, g: ChesscomGame): GameRow | null {
  if (g.rules !== 'chess' || !g.pgn) return null;
  const { sans, standard } = gameMovesFromPgn(g.pgn);
  if (!standard) return null;
  const color = g.white.username.toLowerCase() === account ? 'white' : 'black';
  const [me, them] = color === 'white' ? [g.white, g.black] : [g.black, g.white];
  return {
    id: `chesscom:${g.uuid}`,
    userId,
    source: 'chesscom',
    url: g.url,
    playedAt: new Date(g.end_time * 1000),
    color,
    result: me.result === 'win' ? 'win' : CHESSCOM_DRAWS.has(me.result) ? 'draw' : 'loss',
    speed: g.time_class,
    rated: g.rated,
    opponent: them.username,
    opponentRating: them.rating ?? null,
    myRating: me.rating ?? null,
    moves: sans,
  };
}

/** Monthly archives from the month of the last synced game on, one request at a time. */
async function syncChesscom(user: User, job: SyncJob) {
  if (!user.chesscomUsername) throw new Error('Indiquez votre pseudo Chess.com dans les paramètres');
  const account = user.chesscomUsername.toLowerCase();
  let last = await syncState(user.id, 'chesscom', account);
  const from = last ? `${last.getUTCFullYear()}/${String(last.getUTCMonth() + 1).padStart(2, '0')}` : '';
  const months = (await chesscomArchives(account)).filter((m) => m >= from);
  job.progress = { done: 0, total: months.length };
  for (const month of months) {
    const rows = (await chesscomMonth(account, month))
      .map((g) => fromChesscom(user.id, account, g))
      .filter((r): r is GameRow => !!r && (!last || r.playedAt > last));
    last = await store(user.id, 'chesscom', account, rows, job, last);
    job.progress.done++;
  }
}

const LICHESS_SPEEDS: Record<string, string> = { ultraBullet: 'bullet', correspondence: 'daily' };

function fromLichess(userId: string, account: string, g: LichessGameExport): GameRow | null {
  if (g.variant !== 'standard' || g.initialFen || !g.moves) return null;
  const color = g.players.white.user?.id === account ? 'white' : 'black';
  const [me, them] = color === 'white' ? [g.players.white, g.players.black] : [g.players.black, g.players.white];
  return {
    id: `lichess:${g.id}`,
    userId,
    source: 'lichess',
    url: `https://lichess.org/${g.id}${color === 'black' ? '/black' : ''}`,
    playedAt: new Date(g.lastMoveAt ?? g.createdAt),
    color,
    result: !g.winner ? 'draw' : g.winner === color ? 'win' : 'loss',
    speed: LICHESS_SPEEDS[g.speed] ?? g.speed,
    rated: g.rated,
    opponent: them.user?.name ?? 'Anonymous',
    opponentRating: them.rating ?? null,
    myRating: me.rating ?? null,
    moves: g.moves.split(' ').filter(Boolean),
  };
}

async function syncLichess(user: User, job: SyncJob) {
  if (!user.lichessUsername) throw new Error('Liez votre compte Lichess dans les paramètres');
  const account = user.lichessUsername.toLowerCase();
  const last = await syncState(user.id, 'lichess', account);
  const exported = await lichessUserGames(account, last?.getTime() ?? null, user.lichessToken ?? env.lichessAppToken);
  const rows = exported.map((g) => fromLichess(user.id, account, g)).filter((r): r is GameRow => !!r);
  await store(user.id, 'lichess', account, rows, job, last);
}

/** Deviations from the last two weeks make my repertoire moves of their position due for review now. */
const RECENT_MS = 14 * 86_400_000;

async function scheduleDeviations(userId: string, job: SyncJob) {
  if (!job.added) return;
  const since = new Date(Date.now() - RECENT_MS);
  const recent = await db.select().from(games).where(and(eq(games.userId, userId), gte(games.playedAt, since)));
  const reps = await loadRepertoires(userId);
  let reviews = 0;
  for (const a of analyseGames(recent, reps)) {
    if (a.kind !== 'my-deviation' || !a.repertoireId) continue;
    reviews += await makeDue(db, userId, a.repertoireId, a.fen);
  }
  job.reviews = reviews;
}

