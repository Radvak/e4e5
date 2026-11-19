/**
 * Offline data: the query cache is kept in IndexedDB, so the app opens and trains without network
 * (the service worker keeps the app itself). Only what the offline pages need is kept: account,
 * repertoires, move cards, gap report (reach probabilities: depth of the lines), position
 * statistics already seen (opponent's replies in "Jouer les lignes") and training history.
 *
 * The cache is dropped by a new build (shapes of the answers may have changed: the new version
 * runs online and fills it again) and after MAX_AGE without opening the app.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query, QueryClient } from '@tanstack/react-query';
import { createStore, del, get, set } from 'idb-keyval';

const store = createStore('tabiya-cache', 'queries');

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key, store).then((v) => v ?? null),
    setItem: (key, value: string) => set(key, value, store),
    removeItem: (key) => del(key, store),
  },
  key: 'queries',
  throttleTime: 2000,
});

/**
 * Also the gcTime of the kept queries, so it must stay under the largest setTimeout delay
 * (2^31 - 1 ms, 24.8 days): above it the timer fires at once and every restored query is dropped.
 */
export const MAX_AGE = 20 * 86_400_000;
const KEPT = ['me', 'repertoires', 'repertoire', 'cards', 'gaps', 'explorer', 'stats-history'];

/** Kept queries stay in memory as long as on the device (else unused ones would not be saved). */
export function keepOfflineQueries(qc: QueryClient) {
  for (const key of KEPT) qc.setQueryDefaults([key], { gcTime: MAX_AGE });
}

export const persistOptions = {
  persister,
  maxAge: MAX_AGE,
  buster: __BUILD_ID__,
  dehydrateOptions: {
    // With data, even when the last refetch failed (status "error" offline keeps the data).
    shouldDehydrateQuery: (q: Query) => q.state.data !== undefined && KEPT.includes(String(q.queryKey[0])),
  },
};

/** Forgets the data kept on the device (logging out, another account). */
export async function clearOfflineData(qc: QueryClient) {
  qc.clear();
  await persister.removeClient();
}
