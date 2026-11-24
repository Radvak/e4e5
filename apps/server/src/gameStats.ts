/**
 * Position statistics of the Lichess game database (database.lichess.org), built offline by
 * tools/stats (build.ts) into a SQLite file: one row per position played often enough, keyed
 * by its Zobrist key, with its games counted per speed and rating bucket (core statsCodec). Any
 * settings are answered by adding up their cells, without asking Lichess.
 *
 * The file is opened read-only at startup (STATS_DB, by default stats.db next to the database);
 * replacing it needs a restart. No file: everything comes from the Lichess explorer as before.
 */
import { existsSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { cellsOf, decodePositionStats, playUci, zobristOfFen, type ExplorerResponse } from '@tabiya/core';
import { env } from './env.js';

/** Months of the games (YYYY-MM), the period to ask the Lichess explorer for the same scale. */
export interface Period {
  since: string;
  until: string;
}

interface GameStats {
  period: Period;
  /** Key of the period in position_stats (statistics fetched from Lichess for it). */
  periodKey: string;
  get: StatementSync;
}

function open(path: string): GameStats | null {
  if (!existsSync(path)) return null;
  const db = new DatabaseSync(path, { readOnly: true });
  const meta = Object.fromEntries(
    (db.prepare('SELECT name, value FROM meta').all() as { name: string; value: string }[]).map((r) => [r.name, JSON.parse(r.value)]),
  ) as { months: string[] };
  const months = meta.months
    .map((m) => /(20\d{2}-(0[1-9]|1[0-2]))(?!\d)/.exec(m)?.[1])
    .filter((m): m is string => !!m)
    .sort();
  if (!months.length) throw new Error(`${path} : mois des parties introuvables (table meta)`);
  const period = { since: months[0]!, until: months.at(-1)! };
  return { period, periodKey: `${period.since}..${period.until}`, get: db.prepare('SELECT data FROM stats WHERE key = ?') };
}

const gameStats = open(env.statsDb);

/** The period of the game statistics, null without a stats file. */
export const gamePeriod = (): Period | null => gameStats?.period ?? null;
/** Key of that period in position_stats ('' without a stats file: the explorer's whole history). */
export const periodKey = (): string => gameStats?.periodKey ?? '';

/**
 * Statistics of a position for some speeds and rating buckets, in the format of the Lichess
 * explorer (most played moves first, at most `maxMoves`); null if the position is not in the file
 * (played too rarely) or without a file.
 */
export function gameStatsOf(fen: string, speeds: string[], ratings: number[], maxMoves: number): ExplorerResponse | null {
  if (!gameStats) return null;
  const row = gameStats.get.get(zobristOfFen(fen)) as { data: Uint8Array } | undefined;
  if (!row) return null;
  const s = decodePositionStats(row.data, cellsOf(speeds, ratings));
  const moves = [];
  for (const m of s.moves) {
    if (moves.length >= maxMoves) break;
    const san = playUci(fen, m.uci)?.san;
    if (san) moves.push({ ...m, san });
  }
  return { white: s.white, draws: s.draws, black: s.black, moves, opening: null };
}
