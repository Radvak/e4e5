/**
 * The app's database when it runs without a server: SQLite in a worker (sqlite.worker.ts), seen
 * through Drizzle's sqlite-proxy driver, so the shared data functions (@tabiya/data) run on it
 * exactly as on the server. The schema comes from the server's migrations, replayed here in order.
 * One user only: LOCAL_USER.
 */
import * as schema from '@tabiya/data/schema';
import type { Db } from '@tabiya/data';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import journal from '../../../server/drizzle/meta/_journal.json';
import type { Method, Ready, Request, Response, StatsOp, StatsRequest } from './sqlite.worker';

/** The only user of a local database. */
export const LOCAL_USER = 'local';

const migrations = import.meta.glob<string>('../../../server/drizzle/*.sql', { query: '?raw', import: 'default', eager: true });

export interface LocalDb {
  db: Db;
  /** false: kept in memory only (no OPFS), lost when the page closes. */
  persistent: boolean;
  /** An operation on the statistics files (sqlite.worker.ts); `onProgress` for downloads. */
  stats: (op: StatsOp, onProgress?: (p: { loaded: number; total: number }) => void) => Promise<unknown[]>;
}

let opening: Promise<LocalDb> | null = null;

/** The local database, opened and migrated once. */
export function localDb(): Promise<LocalDb> {
  opening ??= open().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}

async function open(): Promise<LocalDb> {
  const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' });
  const ready = await new Promise<Ready>((resolve) => {
    const onReady = (e: MessageEvent) => {
      if (!('ready' in e.data)) return;
      worker.removeEventListener('message', onReady);
      resolve(e.data as Ready);
    };
    worker.addEventListener('message', onReady);
  });
  if (!ready.ready) {
    worker.terminate();
    throw new Error(ready.error);
  }

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (rows: unknown[] | undefined) => void; reject: (e: Error) => void; progress?: (p: { loaded: number; total: number }) => void }
  >();
  worker.addEventListener('message', (e: MessageEvent<Response>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    if ('progress' in e.data) return p.progress?.(e.data.progress);
    pending.delete(e.data.id);
    if ('error' in e.data) p.reject(new Error(e.data.error));
    else p.resolve(e.data.rows);
  });
  const query = (sql: string, params: unknown[], method: Method) =>
    new Promise<unknown[] | undefined>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, sql, params, method } satisfies Request);
    });

  // Migrations not applied yet, in the journal's order.
  await query('CREATE TABLE IF NOT EXISTS __local_migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)', [], 'run');
  const done = new Set(((await query('SELECT tag FROM __local_migrations', [], 'all')) as [string][]).map((r) => r[0]));
  for (const { tag } of journal.entries) {
    if (done.has(tag)) continue;
    const sql = migrations[`../../../server/drizzle/${tag}.sql`];
    if (sql === undefined) throw new Error(`Migration ${tag} introuvable`);
    await query(sql.replaceAll('--> statement-breakpoint', ''), [], 'exec');
    await query('INSERT INTO __local_migrations (tag, applied_at) VALUES (?, ?)', [tag, Date.now()], 'run');
  }

  const db = drizzle(async (sql, params, method) => ({ rows: (await query(sql, params, method)) as never }), { schema }) as unknown as Db;
  await db.insert(schema.users).values({ id: LOCAL_USER, username: 'Moi' }).onConflictDoNothing();
  const stats = (op: StatsOp, progress?: (p: { loaded: number; total: number }) => void) =>
    new Promise<unknown[]>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: (rows) => resolve(rows ?? []), reject, progress });
      worker.postMessage({ id, stats: op } satisfies StatsRequest);
    });
  return { db, persistent: ready.persistent, stats };
}
