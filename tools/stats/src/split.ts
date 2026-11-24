/**
 * Splits the statistics of the Lichess game database (stats.db, see gameStats.ts) into one file
 * per rating bucket, for the app to download and read on the device (without a server).
 *
 *   pnpm --filter stats split --in stats.db --out stats-files [--min 50]
 *
 * Each file keeps the cells of its bucket (every speed), with their global numbers, so the same
 * decoder reads it, and the positions played at least `--min` times in that bucket. Written
 * gzipped (`stats-<bucket>.db.gz`, decompressed by the app), with `index.json` listing them.
 */
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { bucketCells, decodePositionCounts, encodePositionStats, gamesOf, keepCells, RATING_BUCKETS } from '@tabiya/core';

const { values } = parseArgs({ options: { in: { type: 'string' }, out: { type: 'string' }, min: { type: 'string', default: '50' } } });
if (!values.in || !values.out) {
  console.error('Usage: pnpm --filter stats split --in <stats.db> --out <folder> [--min 50]');
  process.exit(1);
}
const min = Number(values.min);
mkdirSync(values.out, { recursive: true });

const source = new DatabaseSync(values.in, { readOnly: true });
const meta = Object.fromEntries(
  (source.prepare('SELECT name, value FROM meta').all() as { name: string; value: string }[]).map((r) => [r.name, JSON.parse(r.value) as unknown]),
);
const months = ((meta.months ?? []) as string[])
  .map((m) => /(20\d{2}-(0[1-9]|1[0-2]))(?!\d)/.exec(m)?.[1])
  .filter((m): m is string => !!m)
  .sort();
if (!months.length) throw new Error(`${values.in}: months of the games not found (meta table)`);
const period = { since: months[0]!, until: months.at(-1)! };

const outputs = RATING_BUCKETS.map((bucket) => {
  const path = join(values.out!, `stats-${bucket}.db`);
  rmSync(path, { force: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE stats (key INTEGER PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID;
    CREATE TABLE meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    BEGIN;
  `);
  return { bucket, path, db, cells: bucketCells(bucket), insert: db.prepare('INSERT INTO stats (key, data) VALUES (?, ?)'), positions: 0 };
});

let read = 0;
const rows = source.prepare('SELECT key, data FROM stats');
rows.setReadBigInts(true);
for (const row of rows.iterate() as Iterable<{ key: bigint; data: Uint8Array }>) {
  const counts = decodePositionCounts(row.data);
  for (const out of outputs) {
    const kept = keepCells(counts, out.cells);
    if (gamesOf(kept.total) < min) continue;
    out.insert.run(row.key, encodePositionStats(kept));
    out.positions++;
  }
  if (++read % 100_000 === 0) console.log(`${read} positions read`);
}

const files = [];
for (const out of outputs) {
  const info = { ...period, bucket: out.bucket, min, games: meta.games, plies: meta.plies, builtAt: meta.builtAt };
  const setMeta = out.db.prepare('INSERT INTO meta (name, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(info)) setMeta.run(k, JSON.stringify(v ?? null));
  out.db.exec('COMMIT; VACUUM;');
  out.db.close();
  const raw = readFileSync(out.path);
  const file = `stats-${out.bucket}.db.gz`;
  writeFileSync(join(values.out, file), gzipSync(raw, { level: 9 }));
  rmSync(out.path);
  const bytes = statSync(join(values.out, file)).size;
  files.push({ bucket: out.bucket, file, bytes, size: raw.length, positions: out.positions });
  console.log(`${file}: ${out.positions} positions, ${(raw.length / 1e6).toFixed(1)} Mo (${(bytes / 1e6).toFixed(1)} Mo compressé)`);
}
writeFileSync(join(values.out, 'index.json'), `${JSON.stringify({ version: 1, period, min, builtAt: meta.builtAt ?? null, files }, null, 2)}\n`);
console.log(`${read} positions read, index.json written in ${values.out}`);
