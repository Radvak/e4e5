/**
 * Position statistics (Lichess opening explorer), backed by the shared `position_stats` table.
 *
 * - Exact match (same position, speeds and rating buckets) and fresh: served from the table.
 * - Otherwise fetched from Lichess when a token is available, and stored.
 * - If Lichess cannot be used (no token, rate limit, network), the closest stored combination
 *   for that position is served instead, flagged `exact: false` so the UI can say so.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  fenKey,
  normaliseExplorerUci,
  playUciOn,
  START_FEN,
  positionFromFen,
  type ExplorerResponse,
} from '@tabiya/core';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db/client.js';
import { SEED_DIR } from './paths.js';
import { positionStats, seedImports } from './db/schema.js';
import { explorerCooldownUntil, explorerFetch, RateLimited } from './lichess.js';

/**
 * Stored statistics older than this are refreshed when Lichess is reachable. Opening statistics
 * move very slowly (millions of games per position), so a year-old answer is still reliable.
 */
const REFRESH_AFTER_MS = 365 * 86_400_000;
const MAX_MOVES = 30;

export interface StatsMeta {
  speeds: string[];
  ratings: number[];
  /** false: closest available combination, not the one asked for. */
  exact: boolean;
  fetchedAt: string;
  source: 'lichess' | 'seed' | 'import';
  /** Why live data could not be used, when relevant. */
  reason?: 'no-token' | 'rate-limited' | 'unreachable';
}

export type StatsResult = { data: ExplorerResponse; meta: StatsMeta } | { data: null; reason: StatsMeta['reason'] };

type Row = typeof positionStats.$inferSelect;

const csv = (xs: (string | number)[]) => xs.join(',');

function toResult(row: Row, exact: boolean, reason?: StatsMeta['reason']) {
  return {
    data: row.data,
    meta: {
      speeds: row.speeds.split(','),
      ratings: row.ratings.split(',').map(Number),
      exact,
      fetchedAt: row.fetchedAt.toISOString(),
      source: row.source,
      reason,
    },
  };
}

/** Keeps only what the app uses (Lichess answers also carry games, per-move openings, …). */
export function slim(raw: ExplorerResponse): ExplorerResponse {
  return {
    white: raw.white,
    draws: raw.draws,
    black: raw.black,
    opening: raw.opening ? { eco: raw.opening.eco, name: raw.opening.name } : null,
    moves: raw.moves.slice(0, MAX_MOVES).map((m) => ({
      uci: normaliseExplorerUci(m.uci, m.san),
      san: m.san,
      white: m.white,
      draws: m.draws,
      black: m.black,
      ...(m.averageRating ? { averageRating: m.averageRating } : {}),
    })),
  };
}

const jaccard = <T>(a: T[], b: T[]) => {
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / (a.length + b.length - inter || 1);
};

/** Stored combination closest to the request: rating overlap matters most, then speeds. */
function closest(rows: Row[], speeds: string[], ratings: number[]): Row | undefined {
  let best: Row | undefined;
  let bestScore = -1;
  for (const row of rows) {
    const score =
      2 * jaccard(ratings, row.ratings.split(',').map(Number)) + jaccard(speeds, row.speeds.split(','));
    if (score > bestScore) [best, bestScore] = [row, score];
  }
  return best;
}

export async function getStats(
  fen: string,
  speeds: string[],
  ratings: number[],
  token: string | null,
  log: { warn: (obj: object, msg: string) => void },
): Promise<StatsResult> {
  const rows = await db.select().from(positionStats).where(eq(positionStats.fen, fen));
  const exact = rows.find((r) => r.speeds === csv(speeds) && r.ratings === csv(ratings));
  if (exact && Date.now() - exact.fetchedAt.getTime() < REFRESH_AFTER_MS) return toResult(exact, true);

  let reason: StatsMeta['reason'] = 'no-token';
  if (token) {
    try {
      const params = new URLSearchParams({
        variant: 'standard',
        fen,
        speeds: csv(speeds),
        ratings: csv(ratings),
        moves: String(MAX_MOVES),
        topGames: '0',
        recentGames: '0',
      });
      const data = slim((await explorerFetch(`/lichess?${params}`, token)) as ExplorerResponse);
      const row = { fen, speeds: csv(speeds), ratings: csv(ratings), data, fetchedAt: new Date(), source: 'lichess' as const };
      await db
        .insert(positionStats)
        .values(row)
        .onConflictDoUpdate({
          target: [positionStats.fen, positionStats.speeds, positionStats.ratings],
          set: { data: row.data, fetchedAt: row.fetchedAt, source: row.source },
        });
      return toResult(row, true);
    } catch (e) {
      reason = e instanceof RateLimited ? 'rate-limited' : 'unreachable';
      if (!(e instanceof RateLimited)) log.warn({ err: e }, 'explorer request failed');
    }
  }
  if (exact) return toResult(exact, true, reason); // stale but exact
  const near = closest(rows, speeds, ratings);
  return near ? toResult(near, false, reason) : { data: null, reason };
}

/**
 * Stored statistics of many positions, without calling Lichess: the exact combination (even if
 * old), else the closest stored one (`exact: false`). Positions with nothing stored are absent.
 */
export async function storedStats(
  fens: string[],
  speeds: string[],
  ratings: number[],
): Promise<Map<string, { data: ExplorerResponse; exact: boolean }>> {
  const byFen = new Map<string, Row[]>();
  for (let i = 0; i < fens.length; i += 500) {
    const rows = await db.select().from(positionStats).where(inArray(positionStats.fen, fens.slice(i, i + 500)));
    for (const r of rows) byFen.set(r.fen, [...(byFen.get(r.fen) ?? []), r]);
  }
  const out = new Map<string, { data: ExplorerResponse; exact: boolean }>();
  for (const [fen, rows] of byFen) {
    const exact = rows.find((r) => r.speeds === csv(speeds) && r.ratings === csv(ratings));
    const row = exact ?? closest(rows, speeds, ratings);
    if (row) out.set(fen, { data: row.data, exact: !!exact });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Background prefetch: positions an analysis needs (e.g. the gap finder), fetched one at a time
// through the same Lichess queue as live requests, waiting out rate limits.

interface Job {
  fen: string;
  speeds: string[];
  ratings: number[];
  token: string;
}
const jobs = new Map<string, Job>();
/** Failed jobs are not queued again for a while (Lichess down, invalid token, …). */
const failedAt = new Map<string, number>();
const RETRY_FAILED_MS = 10 * 60_000;
let draining = false;

const jobKey = (fen: string, speeds: string[], ratings: number[]) => `${fen}|${csv(speeds)}|${csv(ratings)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Queues the positions not queued yet; returns how many of `fens` are waiting to be fetched. */
export function prefetchStats(
  fens: string[],
  speeds: string[],
  ratings: number[],
  token: string,
  log: { warn: (obj: object, msg: string) => void },
): number {
  let waiting = 0;
  for (const fen of fens) {
    const key = jobKey(fen, speeds, ratings);
    if (Date.now() - (failedAt.get(key) ?? 0) < RETRY_FAILED_MS) continue;
    if (!jobs.has(key)) jobs.set(key, { fen, speeds, ratings, token });
    waiting++;
  }
  void drain(log);
  return waiting;
}

async function drain(log: { warn: (obj: object, msg: string) => void }) {
  if (draining) return;
  draining = true;
  try {
    while (jobs.size) {
      const [key, job] = jobs.entries().next().value!;
      const wait = explorerCooldownUntil() - Date.now();
      if (wait > 0) {
        await sleep(wait + 1000);
        continue;
      }
      try {
        const res = await getStats(job.fen, job.speeds, job.ratings, job.token, log);
        const reason = res.data ? res.meta.reason : res.reason;
        if (reason === 'rate-limited') continue; // retried after the cooldown
        if (reason) failedAt.set(key, Date.now());
      } catch (e) {
        log.warn({ err: e }, 'background stats fetch failed');
        failedAt.set(key, Date.now());
      }
      jobs.delete(key);
    }
  } finally {
    draining = false;
  }
}

// ---------------------------------------------------------------------------------------------
// Import / export

export interface StatsEntry {
  fen: string;
  speeds: string[];
  ratings: number[];
  fetchedAt: number;
  data: ExplorerResponse;
}

/** Seed file format (gzipped JSON). */
export interface StatsSeed {
  version: 1;
  entries: StatsEntry[];
}

/**
 * Entries from a JSON object mapping explorer query strings to explorer answers, e.g. a cache
 * written by an explorer script (`play=e2e4,e7e5…` or `fen=…` queries).
 */
export function entriesFromQueryCache(cache: Record<string, ExplorerResponse>, fetchedAt: number): StatsEntry[] {
  const entries: StatsEntry[] = [];
  for (const [query, data] of Object.entries(cache)) {
    if (!data || !Array.isArray(data.moves)) continue;
    const q = new URLSearchParams(query);
    if ((q.get('variant') ?? 'standard') !== 'standard') continue;
    let fen: string | null = null;
    try {
      if (q.get('fen')) {
        fen = fenKey(positionFromFen(q.get('fen')!));
      } else {
        const pos = positionFromFen(START_FEN);
        const play = q.get('play') ?? '';
        fen = START_FEN;
        for (const uci of play ? play.split(',') : []) {
          const played = playUciOn(pos, uci);
          if (!played) throw new Error(`illegal ${uci}`);
          fen = played.toFen;
        }
      }
    } catch {
      continue;
    }
    entries.push({
      fen,
      speeds: (q.get('speeds') ?? '').split(',').filter(Boolean).sort(),
      ratings: (q.get('ratings') ?? '').split(',').filter(Boolean).map(Number).sort((a, b) => a - b),
      fetchedAt,
      data: slim(data),
    });
  }
  return entries;
}

/** Upserts entries; a stored row is only replaced by a more recent one. Returns rows written. */
export async function importEntries(entries: StatsEntry[], source: 'seed' | 'import'): Promise<number> {
  let written = 0;
  const batch = 200;
  for (let i = 0; i < entries.length; i += batch) {
    const rows = entries.slice(i, i + batch).map((e) => ({
      fen: e.fen,
      speeds: csv(e.speeds),
      ratings: csv(e.ratings),
      data: e.data,
      fetchedAt: new Date(e.fetchedAt),
      source,
    }));
    for (const row of rows) {
      const [existing] = await db
        .select({ fetchedAt: positionStats.fetchedAt })
        .from(positionStats)
        .where(and(eq(positionStats.fen, row.fen), eq(positionStats.speeds, row.speeds), eq(positionStats.ratings, row.ratings)));
      if (existing && existing.fetchedAt >= row.fetchedAt) continue;
      await db
        .insert(positionStats)
        .values(row)
        .onConflictDoUpdate({
          target: [positionStats.fen, positionStats.speeds, positionStats.ratings],
          set: { data: row.data, fetchedAt: row.fetchedAt, source: row.source },
        });
      written++;
    }
  }
  return written;
}

export async function exportEntries(): Promise<StatsSeed> {
  const rows = await db.select().from(positionStats);
  return {
    version: 1,
    entries: rows.map((r) => ({
      fen: r.fen,
      speeds: r.speeds.split(','),
      ratings: r.ratings.split(',').map(Number),
      fetchedAt: r.fetchedAt.getTime(),
      data: r.data,
    })),
  };
}

export { SEED_DIR };

/** At startup: imports each bundled seed (`seed/*.json.gz`) not imported yet. */
export async function importSeeds(log: { info: (msg: string) => void }) {
  let files: string[] = [];
  try {
    files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json.gz')).sort();
  } catch {
    return;
  }
  const done = new Set((await db.select({ name: seedImports.name }).from(seedImports)).map((r) => r.name));
  for (const file of files.filter((f) => !done.has(f))) {
    const seed = JSON.parse(gunzipSync(readFileSync(join(SEED_DIR, file))).toString('utf8')) as StatsSeed;
    const written = await importEntries(seed.entries, 'seed');
    await db.insert(seedImports).values({ name: file, importedAt: new Date() });
    log.info(`Imported ${written}/${seed.entries.length} position stats from seed ${file}`);
  }
}
