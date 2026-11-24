/**
 * Game sync: imports the user's games from Lichess and Chess.com into the `games` table, in the
 * background (one job per user and source), newest games only after the first sync. Runs on the
 * server, or in the app without a server (the job then lives while the page is open).
 */
import { gameMovesFromPgn } from '@tabiya/core';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DataError, type Db } from './db.js';
import { analyseGames, loadRepertoires } from './gameAnalysis.js';
import { chesscomArchives, chesscomMonth, lichessUserGames, type ChesscomGame, type GameSources, type LichessGameExport } from './gameSources.js';
import { games, gameSyncs } from './schema.js';
import { makeDue } from './training.js';

export type Source = 'lichess' | 'chesscom';
type GameRow = typeof games.$inferInsert;

/** The user whose games are synced, with their accounts on the two sites. */
export interface SyncUser {
  id: string;
  chesscomUsername: string | null;
  lichessUsername: string | null;
}

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

/** Accounts, last syncs, running jobs, games stored. */
export async function syncStatus(db: Db, user: SyncUser) {
  const [syncs, counts] = await Promise.all([
    db.select().from(gameSyncs).where(eq(gameSyncs.userId, user.id)),
    db
      .select({ source: games.source, n: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, user.id))
      .groupBy(games.source),
  ]);
  return {
    accounts: { chesscom: user.chesscomUsername ?? null, lichess: user.lichessUsername ?? null },
    syncs: syncs.map((s) => ({ source: s.source, account: s.account, lastGameAt: s.lastGameAt?.toISOString() ?? null, syncedAt: s.syncedAt.toISOString() })),
    counts: Object.fromEntries(counts.map((c) => [c.source, Number(c.n)])),
    jobs: syncJobs(user.id),
  };
}

/**
 * Starts a sync unless one is running; returns the job (its progress: syncStatus). 409 without
 * an account on that site.
 */
export function startSync(db: Db, user: SyncUser, source: Source, src: GameSources, onError?: (e: Error) => void): SyncJob {
  if (source === 'chesscom' && !user.chesscomUsername) throw new DataError(409, 'Indiquez votre pseudo Chess.com dans les paramètres');
  if (source === 'lichess' && !user.lichessUsername) throw new DataError(409, 'Liez votre compte Lichess dans les paramètres');
  const key = jobKey(user.id, source);
  const running = jobs.get(key);
  if (running?.status === 'running') return running;
  const job: SyncJob = { source, status: 'running', startedAt: new Date().toISOString(), fetched: 0, added: 0 };
  jobs.set(key, job);
  const run = source === 'chesscom' ? syncChesscom(db, user, job, src) : syncLichess(db, user, job, src);
  run
    .then(() => scheduleDeviations(db, user.id, job))
    .then(() => void (job.status = 'done'))
    .catch((e: Error) => {
      onError?.(e);
      job.status = 'error';
      job.error = e.message;
    });
  return job;
}

async function syncState(db: Db, userId: string, source: Source, account: string) {
  const [row] = await db.select().from(gameSyncs).where(and(eq(gameSyncs.userId, userId), eq(gameSyncs.source, source)));
  // Another account: start over.
  return row && row.account === account ? row.lastGameAt : null;
}

/** Stores new games and moves the sync cursor to the newest one. */
export async function store(db: Db, userId: string, source: Source, account: string, rows: GameRow[], job: SyncJob, lastGameAt: Date | null) {
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
async function syncChesscom(db: Db, user: SyncUser, job: SyncJob, src: GameSources) {
  const account = user.chesscomUsername!.toLowerCase();
  let last = await syncState(db, user.id, 'chesscom', account);
  const from = last ? `${last.getUTCFullYear()}/${String(last.getUTCMonth() + 1).padStart(2, '0')}` : '';
  const months = (await chesscomArchives(src, account)).filter((m) => m >= from);
  job.progress = { done: 0, total: months.length };
  for (const month of months) {
    const rows = (await chesscomMonth(src, account, month))
      .map((g) => fromChesscom(user.id, account, g))
      .filter((r): r is GameRow => !!r && (!last || r.playedAt > last));
    last = await store(db, user.id, 'chesscom', account, rows, job, last);
    job.progress.done++;
  }
}

const LICHESS_SPEEDS: Record<string, string> = { ultraBullet: 'bullet', correspondence: 'daily' };

export function fromLichess(userId: string, account: string, g: LichessGameExport): GameRow | null {
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

async function syncLichess(db: Db, user: SyncUser, job: SyncJob, src: GameSources) {
  const account = user.lichessUsername!.toLowerCase();
  const last = await syncState(db, user.id, 'lichess', account);
  const exported = await lichessUserGames(src, account, last?.getTime() ?? null);
  const rows = exported.map((g) => fromLichess(user.id, account, g)).filter((r): r is GameRow => !!r);
  await store(db, user.id, 'lichess', account, rows, job, last);
}

/** Deviations from the last two weeks make my repertoire moves of their position due for review now. */
const RECENT_MS = 14 * 86_400_000;

async function scheduleDeviations(db: Db, userId: string, job: SyncJob) {
  if (!job.added) return;
  const since = new Date(Date.now() - RECENT_MS);
  const recent = await db.select().from(games).where(and(eq(games.userId, userId), gte(games.playedAt, since)));
  const reps = await loadRepertoires(db, userId);
  let reviews = 0;
  for (const a of analyseGames(recent, reps)) {
    if (a.kind !== 'my-deviation' || !a.repertoireId) continue;
    reviews += await makeDue(db, userId, a.repertoireId, a.fen);
  }
  job.reviews = reviews;
}
