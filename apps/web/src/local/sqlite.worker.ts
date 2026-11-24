/// <reference lib="webworker" />
/**
 * SQLite running in the browser, in a worker: the app's database when it runs without a server.
 * Stored in the origin private file system with the "opfs-sahpool" VFS, which needs no special
 * HTTP headers (GitHub Pages can't set them). Its limit: one tab at a time holds the database.
 * Without OPFS (private browsing, old browser), the database lives in memory only: `persistent`
 * says so.
 *
 * Messages: { id, sql, params, method } → { id, rows } | { id, error }. `method` follows Drizzle's
 * sqlite-proxy: 'run' (no rows), 'all' / 'values' (rows as arrays), 'get' (first row as an
 * array, undefined without a row); 'exec' runs a script of several statements (migrations).
 *
 * The statistics files (one per rating bucket, scripts/split-stats.ts on the server) are other
 * databases of the same pool, opened read-only: { id, stats: … } downloads one (progress sent as
 * { id, progress }), deletes one, lists them, or reads the rows of some positions in some of them.
 */
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm';

export type Method = 'run' | 'all' | 'values' | 'get' | 'exec';
export interface Request {
  id: number;
  sql: string;
  params: unknown[];
  method: Method;
}
/** A statistics file on the device: its bucket, positions and the months of its games. */
export interface StatsFile {
  bucket: number;
  positions: number;
  since: string;
  until: string;
  builtAt: string | null;
}
export type StatsOp =
  | { op: 'download'; bucket: number; url: string }
  | { op: 'delete'; bucket: number }
  | { op: 'list' }
  /** keys: Zobrist keys (decimal strings); answers, per key, the rows of the buckets asked. */
  | { op: 'get'; buckets: number[]; keys: string[] };
export interface StatsRequest {
  id: number;
  stats: StatsOp;
}
export type Response =
  | { id: number; rows: unknown[] | undefined }
  | { id: number; error: string }
  | { id: number; progress: { loaded: number; total: number } };
export type Ready = { ready: true; persistent: boolean } | { ready: false; error: string };

type Pool = Awaited<ReturnType<Awaited<ReturnType<typeof sqlite3InitModule>>['installOpfsSAHPoolVfs']>>;

let db: Database;
let pool: Pool | null = null;
/** Open statistics files, by bucket. */
const statsDbs = new Map<number, Database>();
const statsPath = (bucket: number) => `/stats-${bucket}.sqlite3`;

/** The app's database in the pool. */
const APP_DB = '/e4e5.sqlite3';

/**
 * The pool of the app's former name (Tabiya: pool 'tabiya' in /tabiya-db, app database
 * /tabiya.sqlite3) moved into this one, once, while this one has no app database yet: each
 * database file exported, then imported under its new name; the old pool then removed. Throws
 * (as opening does) when another tab still holds the old pool.
 */
async function moveFormerPool(sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>, target: Pool) {
  if (target.getFileNames().includes(APP_DB)) return;
  try {
    await (await navigator.storage.getDirectory()).getDirectoryHandle('tabiya-db');
  } catch {
    return; // nothing stored under the former name
  }
  const old = await sqlite3.installOpfsSAHPoolVfs({ name: 'tabiya', directory: '/tabiya-db' });
  for (const name of old.getFileNames()) {
    if (!name.endsWith('.sqlite3')) continue; // journals
    await target.importDb(name === '/tabiya.sqlite3' ? APP_DB : name, old.exportFile(name));
  }
  await old.removeVfs();
}

const opened = (async (): Promise<Ready> => {
  const sqlite3 = await sqlite3InitModule();
  try {
    // The app's database and up to 9 statistics files, each with its journal.
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'e4e5', directory: '/e4e5-db', initialCapacity: 24 });
    await pool.reserveMinimumCapacity(24);
    await moveFormerPool(sqlite3, pool);
    db = new pool.OpfsSAHPoolDb(APP_DB);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = TRUNCATE;');
    for (const name of pool.getFileNames()) {
      const bucket = /^\/stats-(\d+)\.sqlite3$/.exec(name)?.[1];
      if (bucket !== undefined) statsDbs.set(Number(bucket), new pool.OpfsSAHPoolDb(name));
    }
    return { ready: true, persistent: true };
  } catch (e) {
    // Another tab holds the database: refused rather than working on an empty copy.
    if (String(e).includes('NoModificationAllowedError') || String(e).includes('Access Handles')) {
      return { ready: false, error: 'e4e5 est déjà ouvert dans un autre onglet.' };
    }
    pool = null;
    db = new sqlite3.oo1.DB(':memory:', 'c');
    db.exec('PRAGMA foreign_keys = ON;');
    return { ready: true, persistent: false };
  }
})().catch((e): Ready => ({ ready: false, error: String(e) }));

opened.then((state) => postMessage(state));

function fileInfo(bucket: number, file: Database): StatsFile {
  const meta = Object.fromEntries(
    (file.exec({ sql: 'SELECT name, value FROM meta', rowMode: 'array', returnValue: 'resultRows' }) as [string, string][]).map(([k, v]) => [k, JSON.parse(v)]),
  ) as { since?: string; until?: string; builtAt?: string };
  const [[positions]] = file.exec({ sql: 'SELECT count(*) FROM stats', rowMode: 'array', returnValue: 'resultRows' }) as [[number]];
  return { bucket, positions: Number(positions), since: meta.since ?? '', until: meta.until ?? '', builtAt: meta.builtAt ?? null };
}

/** Downloads a gzipped statistics file, sending the progress, and replaces the bucket's file. */
async function download(id: number, bucket: number, url: string): Promise<StatsFile> {
  if (!pool) throw new Error('Stockage de l’appareil indisponible (navigation privée ?) : statistiques impossibles à enregistrer');
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status})`);
  const total = Number(res.headers.get('Content-Length') ?? 0);
  let loaded = 0;
  let last = 0;
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        loaded += chunk.length;
        if (loaded - last > 256 * 1024 || loaded === total) {
          last = loaded;
          postMessage({ id, progress: { loaded, total } } satisfies Response);
        }
        ctrl.enqueue(chunk);
      },
    }),
  );
  const bytes = new Uint8Array(await new Response(counted.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>)).arrayBuffer());
  statsDbs.get(bucket)?.close();
  statsDbs.delete(bucket);
  await pool.importDb(statsPath(bucket), bytes);
  const file = new pool.OpfsSAHPoolDb(statsPath(bucket));
  statsDbs.set(bucket, file);
  return fileInfo(bucket, file);
}

async function statsOp(id: number, op: StatsOp): Promise<unknown[]> {
  switch (op.op) {
    case 'download':
      return [await download(id, op.bucket, op.url)];
    case 'delete':
      statsDbs.get(op.bucket)?.close();
      statsDbs.delete(op.bucket);
      pool?.unlink(statsPath(op.bucket));
      return [];
    case 'list':
      return [...statsDbs].sort((a, b) => a[0] - b[0]).map(([bucket, file]) => fileInfo(bucket, file));
    case 'get': {
      const files = op.buckets.flatMap((b) => statsDbs.get(b) ?? []);
      const stmts = files.map((f) => f.prepare('SELECT data FROM stats WHERE key = ?'));
      try {
        return op.keys.map((key) => {
          const rows: Uint8Array[] = [];
          for (const stmt of stmts) {
            stmt.bind([BigInt(key)]);
            if (stmt.step()) rows.push(stmt.get(0) as Uint8Array);
            stmt.reset();
          }
          return rows;
        });
      } finally {
        for (const s of stmts) s.finalize();
      }
    }
  }
}

self.onmessage = async (e: MessageEvent<Request | StatsRequest>) => {
  const { id } = e.data;
  const state = await opened;
  if (!state.ready) return postMessage({ id, error: state.error } satisfies Response);
  try {
    if ('stats' in e.data) return postMessage({ id, rows: await statsOp(id, e.data.stats) } satisfies Response);
    const { sql, params, method } = e.data;
    if (method === 'exec') {
      db.exec(sql);
      return postMessage({ id, rows: [] } satisfies Response);
    }
    const rows = db.exec({ sql, bind: params as never, rowMode: 'array', returnValue: 'resultRows' }) as unknown[][];
    postMessage({ id, rows: method === 'get' ? rows[0] : method === 'run' ? [] : rows } satisfies Response);
  } catch (err) {
    postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies Response);
  }
};
