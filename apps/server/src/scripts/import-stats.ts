/**
 * Imports position statistics into the database.
 *
 *   pnpm --filter server stats:import <file>...
 *
 * Accepted files (optionally gzipped): a seed ({ version: 1, entries }) or a JSON object mapping
 * Lichess explorer query strings to explorer answers (e.g. a .lichess-cache.json written by an explorer script).
 */
import { readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runMigrations } from '../db/client.js';
import { entriesFromQueryCache, importEntries, type StatsSeed } from '../stats.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: stats:import <file.json[.gz]>...');
  process.exit(1);
}
await runMigrations();
for (const file of files) {
  const raw = readFileSync(file);
  const json = JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
  const seed = json && json.version === 1 && Array.isArray(json.entries);
  const entries = seed ? (json as StatsSeed).entries : entriesFromQueryCache(json, statSync(file).mtimeMs);
  // Answers of the Lichess explorer, not statistics counted from a sample of games ('import').
  const written = await importEntries(entries, seed ? 'seed' : 'lichess');
  console.log(`${file}: ${entries.length} positions read, ${written} written`);
}
