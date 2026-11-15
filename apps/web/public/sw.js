/*
 * Service worker of Mon cahier: makes the app installable and opens it without network.
 *
 * - Pages (navigations): network first, the cached app shell (index.html) when offline.
 * - /assets/ (content-hashed names) and /stockfish/: cache first, fetched once.
 * - Icons and manifest: cached copy at once, refreshed in the background.
 * - /api/ and other origins: never cached (sessions, live data).
 *
 * On each new index.html, the cached /assets/ files it no longer uses are dropped (a later
 * request for one simply goes to the network). Bump VERSION to drop every cache.
 */
const VERSION = 'v1';
const CACHE = `mon-cahier-${VERSION}`;
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mon-cahier-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') event.respondWith(navigate(req));
  else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/stockfish/')) event.respondWith(cacheFirst(req));
  else if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') event.respondWith(staleWhileRevalidate(event, req));
});

/** Caches index.html and the files it references (entry script, CSS), and drops stale assets. */
async function cacheShell(response) {
  const cache = await caches.open(CACHE);
  const res = response ?? (await fetch(SHELL, { cache: 'no-cache' }));
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(SHELL, res);
  const used = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]));
  await Promise.all(
    [...used].map(async (path) => {
      if (!(await cache.match(path))) await cache.add(path).catch(() => {});
    }),
  );
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !used.has(path) && !path.match(/\.(woff2?|png|svg|jpg)$/)) await cache.delete(req);
  }
}

async function navigate(req) {
  try {
    const res = await fetch(req);
    // Every route of the app is index.html (served by the server's not-found handler).
    if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) {
      cacheShell(res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match(SHELL);
    return cached ?? new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(req, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok) return cache.put(req, res.clone()).then(() => res);
      return res;
    })
    .catch(() => cached ?? Response.error());
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  return update;
}
