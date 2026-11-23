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
 */
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm';

export type Method = 'run' | 'all' | 'values' | 'get' | 'exec';
export interface Request {
  id: number;
  sql: string;
  params: unknown[];
  method: Method;
}
export type Response = { id: number; rows: unknown[] | undefined } | { id: number; error: string };
export type Ready = { ready: true; persistent: boolean } | { ready: false; error: string };

let db: Database;

const opened = (async (): Promise<Ready> => {
  const sqlite3 = await sqlite3InitModule();
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'tabiya', directory: '/tabiya-db' });
    db = new pool.OpfsSAHPoolDb('/tabiya.sqlite3');
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = TRUNCATE;');
    return { ready: true, persistent: true };
  } catch (e) {
    // Another tab holds the database: refused rather than working on an empty copy.
    if (String(e).includes('NoModificationAllowedError') || String(e).includes('Access Handles')) {
      return { ready: false, error: 'Tabiya est déjà ouvert dans un autre onglet.' };
    }
    db = new sqlite3.oo1.DB(':memory:', 'c');
    db.exec('PRAGMA foreign_keys = ON;');
    return { ready: true, persistent: false };
  }
})().catch((e): Ready => ({ ready: false, error: String(e) }));

opened.then((state) => postMessage(state));

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, sql, params, method } = e.data;
  const state = await opened;
  if (!state.ready) return postMessage({ id, error: state.error } satisfies Response);
  try {
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
