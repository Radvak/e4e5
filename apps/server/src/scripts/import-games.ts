/**
 * Imports Chess.com games from monthly archive files already downloaded (e.g. when the server
 * cannot reach Chess.com), as the sync would, for one user.
 *
 *   pnpm games:import --login guest:gab --chesscom lartistefou --dir <folder of YYYY/MM.json files>
 *
 * The folder holds the Chess.com API answers (`/pub/player/<user>/games/YYYY/MM`), found
 * recursively. Sets the user's Chess.com username when it is not set yet.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { db, runMigrations } from '../db/client.js';
import { gameSyncs, users } from '../db/schema.js';
import { fromChesscom, store, type ChesscomGame, type SyncJob } from '@tabiya/data';

const { values } = parseArgs({ options: { login: { type: 'string' }, chesscom: { type: 'string' }, dir: { type: 'string' } } });
if (!values.login || !values.chesscom || !values.dir) {
  console.error('Usage: games:import --login <login> --chesscom <username> --dir <folder>');
  process.exit(1);
}
await runMigrations();
const [user] = await db.select().from(users).where(eq(users.login, values.login.toLowerCase()));
if (!user) throw new Error(`No user with login ${values.login}`);
const account = values.chesscom.toLowerCase();
if (user.chesscomUsername?.toLowerCase() !== account) {
  await db.update(users).set({ chesscomUsername: values.chesscom }).where(eq(users.id, user.id));
  console.log(`Chess.com username of ${user.username} set to ${values.chesscom}`);
}

const files = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    return statSync(path).isDirectory() ? walk(path) : /^\d{2}\.json$/.test(f) ? [path] : [];
  });
})(values.dir).sort();

const [state] = await db.select().from(gameSyncs).where(eq(gameSyncs.userId, user.id));
let last = state?.source === 'chesscom' && state.account === account ? state.lastGameAt : null;
const job: SyncJob = { source: 'chesscom', status: 'running', startedAt: new Date().toISOString(), fetched: 0, added: 0 };
for (const file of files) {
  const { games } = JSON.parse(readFileSync(file, 'utf8')) as { games: ChesscomGame[] };
  const rows = games.map((g) => fromChesscom(user.id, account, g)).filter((r) => r !== null);
  last = await store(db, user.id, 'chesscom', account, rows, job, last);
}
console.log(`${files.length} archive files: ${job.fetched} games read, ${job.added} new.`);
