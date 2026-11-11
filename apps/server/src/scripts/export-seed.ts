/**
 * Writes every stored position statistic into a seed file bundled with the app:
 *
 *   pnpm --filter server stats:export-seed [name]     -> seed/<name>.json.gz
 *
 * Seeds are imported at server startup, once per file name: use a new name for a new version.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { runMigrations } from '../db/client.js';
import { exportEntries, SEED_DIR } from '../stats.js';

const name = process.argv[2] ?? `stats-${new Date().toISOString().slice(0, 10)}`;
await runMigrations();
const seed = await exportEntries();
seed.entries.sort((a, b) => a.fen.localeCompare(b.fen) || a.speeds.join().localeCompare(b.speeds.join()));
const file = join(SEED_DIR, `${name}.json.gz`);
writeFileSync(file, gzipSync(JSON.stringify(seed), { level: 9 }));
console.log(`${seed.entries.length} positions -> ${file}`);
