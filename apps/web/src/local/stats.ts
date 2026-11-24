/**
 * Statistics on the device (local mode): the files of the Lichess game database split per rating
 * bucket (scripts/split-stats.ts on the server), downloaded into the local SQLite. Read by their
 * Zobrist keys, the cells of the buckets asked added up (core statsFromRows).
 *
 * The files are listed in `index.json` at STATS_URL: the project's GitHub Pages in the mobile app,
 * the server for the web app during the migration (VITE_STATS_URL at build time to change it).
 */
import { statsFromRows, zobristOfFen, type ExplorerResponse, type StoredStats } from '@e4e5/core';
import { isNative, isServerless } from '../native';
import { t } from '../i18n';
import { localDb } from './db';
import type { StatsFile } from './sqlite.worker';

export type { StatsFile };

/** GitHub Pages of the project (workflows stats.yml and pages.yml). */
const PAGES_STATS = 'https://gab23r.github.io/e4e5/stats';
const STATS_URL =
  (import.meta.env.VITE_STATS_URL as string | undefined)?.replace(/\/$/, '') ??
  // The mobile app: the project's Pages; a static build: next to the app; else the server.
  (isNative() ? PAGES_STATS : isServerless() ? `${import.meta.env.BASE_URL}stats` : '/api/stats-files');
const MAX_MOVES = 30;
/** Positions read per message to the worker. */
const BATCH = 500;

export interface StatsIndex {
  version: 1;
  period: { since: string; until: string };
  /** Games a position needs in a bucket to be in its file. */
  min: number;
  builtAt: string | null;
  files: { bucket: number; file: string; bytes: number; size: number; positions: number }[];
}

/** The files offered for download. */
export async function statsIndex(): Promise<StatsIndex> {
  const res = await fetch(`${STATS_URL}/index.json`);
  if (!res.ok) throw new Error(
      res.status === 404
        ? t('Aucun fichier de statistiques publié', 'No statistics file published')
        : t(`Liste des statistiques illisible (${res.status})`, `Statistics list unreadable (${res.status})`),
    );
  return (await res.json()) as StatsIndex;
}

let listed: Promise<StatsFile[]> | null = null;

/** The files on the device (read once, until one is downloaded or deleted). */
export function localStatsFiles(): Promise<StatsFile[]> {
  listed ??= localDb()
    .then(({ stats }) => stats({ op: 'list' }) as Promise<StatsFile[]>)
    .catch((e: unknown) => {
      listed = null;
      throw e;
    });
  return listed;
}

export async function downloadStats(file: StatsIndex['files'][number], onProgress?: (p: { loaded: number; total: number }) => void): Promise<StatsFile> {
  try {
    const [info] = await (await localDb()).stats({ op: 'download', bucket: file.bucket, url: `${STATS_URL}/${file.file}` }, onProgress);
    return info as StatsFile;
  } catch (e) {
    throw workerError(e);
  } finally {
    listed = null;
  }
}

/**
 * The worker's messages are written in French (a worker has no localStorage to read the language
 * from): in the interface's language.
 */
function workerError(e: unknown): unknown {
  if (!(e instanceof Error)) return e;
  if (e.message.startsWith('Stockage de l’appareil indisponible'))
    return new Error(t(e.message, 'Device storage unavailable (private browsing?): statistics cannot be saved'));
  const m = /^Téléchargement impossible \((\d+)\)$/.exec(e.message);
  if (m) return new Error(t(e.message, `Download failed (${m[1]})`));
  return e;
}

export async function deleteStats(bucket: number): Promise<void> {
  try {
    await (await localDb()).stats({ op: 'delete', bucket });
  } finally {
    listed = null;
  }
}

/** Statistics on the device for some settings: answers and the months of their games. */
export interface LocalStats {
  /** Positions found (every one exact: the asked speeds and buckets). */
  stored: StoredStats;
  one: (fen: string) => Promise<ExplorerResponse | null>;
  period: { since: string; until: string };
  builtAt: string | null;
}

/**
 * The statistics on the device for these speeds and buckets, null when a bucket asked is not
 * downloaded (the caller asks the server). A position below the files' threshold in one bucket
 * is missing from that file only: the others still count it (a few games short).
 */
export async function localStats(speeds: string[], ratings: number[]): Promise<LocalStats | null> {
  const files = await localStatsFiles();
  const have = new Map(files.map((f) => [f.bucket, f]));
  if (!ratings.length || !ratings.every((b) => have.has(b))) return null;
  const { stats } = await localDb();
  const stored: StoredStats = async (fens) => {
    const out = new Map<string, { data: ExplorerResponse; exact: boolean }>();
    for (let i = 0; i < fens.length; i += BATCH) {
      const part = fens.slice(i, i + BATCH);
      const rows = (await stats({ op: 'get', buckets: ratings, keys: part.map((f) => zobristOfFen(f).toString()) })) as Uint8Array[][];
      part.forEach((fen, j) => {
        const data = statsFromRows(fen, rows[j]!, speeds, ratings, MAX_MOVES);
        if (data) out.set(fen, { data, exact: true });
      });
    }
    return out;
  };
  const first = have.get(ratings[0]!)!;
  return {
    stored,
    one: async (fen) => (await stored([fen])).get(fen)?.data ?? null,
    period: { since: first.since, until: first.until },
    builtAt: first.builtAt,
  };
}
