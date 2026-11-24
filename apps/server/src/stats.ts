/**
 * Position statistics, from what is stored only: Lichess is never asked (its explorer allows one
 * request at a time and refuses servers on its site; every number here comes from files built
 * offline or answers stored before).
 *
 * - First, the statistics of the Lichess game database (gameStats.ts, source 'database') when the
 *   position is in it, for any speeds and levels.
 * - Else the shared `position_stats` table: the exact combination (same position, speeds and
 *   rating buckets) of the period in use (the game database's months), else the closest stored
 *   combination of that period, else of any period (the explorer's whole history: other scale,
 *   same shares), flagged `exact: false` so the UI can say so.
 * - Nothing stored: no statistics (`reason: 'not-stored'`).
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
import { gamePeriod, gameStatsOf, periodKey, type Period } from './gameStats.js';
import { SEED_DIR } from './paths.js';
import { positionStats, seedImports } from './db/schema.js';

export const MAX_MOVES = 30;

export interface StatsMeta {
  speeds: string[];
  ratings: number[];
  /** false: closest available combination, not the one asked for. */
  exact: boolean;
  fetchedAt: string;
  source: 'lichess' | 'seed' | 'import' | 'database';
  /** Months of the games counted (else the explorer's whole history). */
  period?: Period;
  /** Why there are no statistics: nothing stored for the position. */
  reason?: 'not-stored';
}

export type StatsResult = { data: ExplorerResponse; meta: StatsMeta } | { data: null; reason: StatsMeta['reason'] };

type Row = typeof positionStats.$inferSelect;

const csv = (xs: (string | number)[]) => xs.join(',');

function toResult(row: Row, exact: boolean) {
  return {
    data: row.data,
    meta: {
      speeds: row.speeds.split(','),
      ratings: row.ratings.split(',').map(Number),
      exact,
      fetchedAt: row.fetchedAt.toISOString(),
      source: row.source,
      ...(row.period ? { period: gamePeriod() ?? undefined } : {}),
    },
  };
}

/** Statistics of the game database file, in the result format; null if the position is not in it. */
function fromGameStats(fen: string, speeds: string[], ratings: number[]): { data: ExplorerResponse; meta: StatsMeta } | null {
  const data = gameStatsOf(fen, speeds, ratings, MAX_MOVES);
  const period = gamePeriod();
  if (!data || !period) return null;
  return { data, meta: { speeds, ratings, exact: true, fetchedAt: new Date(`${period.until}-01T00:00:00Z`).toISOString(), source: 'database', period } };
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

/** The stored statistics of a position (see the top of the file); never asks Lichess. */
export async function getStats(fen: string, speeds: string[], ratings: number[]): Promise<StatsResult> {
  const fromFile = fromGameStats(fen, speeds, ratings);
  if (fromFile) return fromFile;
  const rows = await db.select().from(positionStats).where(eq(positionStats.fen, fen));
  const best = bestRow(rows, speeds, ratings);
  return best ? toResult(best.row, best.exact) : { data: null, reason: 'not-stored' };
}

/**
 * The stored row to use among a position's rows: the exact combination of the period in use,
 * else the closest of that period, else the closest of any period.
 */
function bestRow(rows: Row[], speeds: string[], ratings: number[]): { row: Row; exact: boolean } | null {
  const period = rows.filter((r) => r.period === periodKey());
  const exact = period.find((r) => r.speeds === csv(speeds) && r.ratings === csv(ratings));
  if (exact) return { row: exact, exact: true };
  const near = closest(period, speeds, ratings) ?? closest(rows, speeds, ratings);
  return near ? { row: near, exact: false } : null;
}

/**
 * Stored statistics of many positions (see `getStats`), at once. Positions with nothing stored
 * are absent.
 */
export async function storedStats(
  fens: string[],
  speeds: string[],
  ratings: number[],
): Promise<Map<string, { data: ExplorerResponse; exact: boolean }>> {
  const out = new Map<string, { data: ExplorerResponse; exact: boolean }>();
  const rest: string[] = [];
  for (const fen of fens) {
    const data = gameStatsOf(fen, speeds, ratings, MAX_MOVES);
    if (data) out.set(fen, { data, exact: true });
    else rest.push(fen);
  }
  const byFen = new Map<string, Row[]>();
  for (let i = 0; i < rest.length; i += 500) {
    const rows = await db.select().from(positionStats).where(inArray(positionStats.fen, rest.slice(i, i + 500)));
    for (const r of rows) byFen.set(r.fen, [...(byFen.get(r.fen) ?? []), r]);
  }
  for (const [fen, rows] of byFen) {
    const best = bestRow(rows, speeds, ratings);
    if (best) out.set(fen, { data: best.row.data, exact: best.exact });
  }
  return out;
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

/**
 * Upserts entries; a stored row is only replaced by a more recent one. Returns rows written.
 * `source`: 'import' for statistics counted from a sample of games (provisional, see getStats),
 * 'lichess' or 'seed' for answers of the Lichess explorer.
 */
export async function importEntries(entries: StatsEntry[], source: Row['source']): Promise<number> {
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
        .where(and(eq(positionStats.fen, row.fen), eq(positionStats.speeds, row.speeds), eq(positionStats.ratings, row.ratings), eq(positionStats.period, '')));
      if (existing && existing.fetchedAt >= row.fetchedAt) continue;
      await db
        .insert(positionStats)
        .values(row)
        .onConflictDoUpdate({
          target: [positionStats.fen, positionStats.speeds, positionStats.ratings, positionStats.period],
          set: { data: row.data, fetchedAt: row.fetchedAt, source: row.source },
        });
      written++;
    }
  }
  return written;
}

export async function exportEntries(): Promise<StatsSeed> {
  const rows = await db.select().from(positionStats).where(eq(positionStats.period, ''));
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
