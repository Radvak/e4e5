/**
 * The app was called Tabiya: what it kept on the device under that name moves to e4e5's names,
 * once. The browser storages belong to the site, so only the names change:
 * - localStorage / sessionStorage keys: here, at once (imported before anything reads them);
 * - IndexedDB stores (query cache, training answers not sent yet): `movedStore`, whose `ready`
 *   is awaited before the store is used;
 * - the SQLite database of local mode (origin private file system): by its worker
 *   (local/sqlite.worker.ts).
 */
import { createStore, keys, promisifyRequest, setMany, type UseStore } from 'idb-keyval';

const LOCAL_KEYS: [string, string][] = [['tabiya.backend', 'e4e5.backend']];
const SESSION_KEYS: [string, string][] = [['tabiya.lichess-oauth', 'e4e5.lichess-oauth']];

function moveKeys(storage: Storage, pairs: [string, string][]) {
  for (const [from, to] of pairs) {
    const value = storage.getItem(from);
    if (value === null) continue;
    if (storage.getItem(to) === null) storage.setItem(to, value);
    storage.removeItem(from);
  }
}
try {
  moveKeys(localStorage, LOCAL_KEYS);
  moveKeys(sessionStorage, SESSION_KEYS);
} catch {
  // Storage refused (private browsing settings): nothing to move.
}

/** The entries of an old IndexedDB database's store; null if the database does not exist. */
async function readOld(dbName: string, storeName: string): Promise<[IDBValidKey, unknown][] | null> {
  if (indexedDB.databases && !(await indexedDB.databases()).some((d) => d.name === dbName)) return null;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    if (!db.objectStoreNames.contains(storeName)) return [];
    const store = db.transaction(storeName).objectStore(storeName);
    const [ks, vs] = await Promise.all([promisifyRequest(store.getAllKeys()), promisifyRequest(store.getAll())]);
    return ks.map((k, i) => [k, vs[i]]);
  } finally {
    db.close();
  }
}

/**
 * The IndexedDB store `newName` / `storeName`, filled once with the entries of the store of the
 * former name (when the new one is still empty), the old database then deleted. Use `store` only
 * after `ready` (never rejects).
 */
export function movedStore(oldName: string, newName: string, storeName: string): { store: UseStore; ready: Promise<void> } {
  const store = createStore(newName, storeName);
  const ready = (async () => {
    const items = await readOld(oldName, storeName);
    if (items === null) return;
    if (items.length && (await keys(store)).length === 0) await setMany(items, store);
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(oldName);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  })().catch((e: unknown) => console.warn(`${oldName} not moved to ${newName}`, e));
  return { store, ready };
}
