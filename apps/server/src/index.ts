import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { constants as zlib } from 'node:zlib';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { setOpeningsTable } from '@tabiya/data';
import { ZodError } from 'zod';
import { authRoutes } from './auth.js';
import { runMigrations } from './db/client.js';
import { env } from './env.js';
import { SEED_DIR, WEB_DIST } from './paths.js';
import { explorerRoutes } from './routes/explorer.js';
import { gameRoutes } from './routes/games.js';
import { gapRoutes } from './routes/gaps.js';
import { syncRoutes } from './routes/sync.js';
import { repertoireRoutes } from './routes/repertoires.js';
import { trainingRoutes } from './routes/training.js';
import { importSeeds } from './stats.js';

await runMigrations();

const app = Fastify({ logger: { level: env.isProd ? 'info' : 'debug' }, trustProxy: true });
await app.register(cookie, { secret: env.cookieSecret });
// Responses compressed (a repertoire is ~15× smaller): brotli at a fast level, else gzip.
await app.register(compress, {
  threshold: 1024,
  encodings: ['br', 'gzip'],
  brotliOptions: { params: { [zlib.BROTLI_PARAM_QUALITY]: 4 } },
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: err.issues[0]?.message ?? 'Invalid request', issues: err.issues });
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  // Expected failures (404, 400 of @tabiya/data) are answers, not server errors.
  if (status >= 500) app.log.error(err);
  else app.log.debug(err);
  return reply.code(status).send({ error: status < 500 ? (err as Error).message : 'Erreur interne' });
});

setOpeningsTable(() => readFileSync(join(SEED_DIR, 'openings.tsv'), 'utf8'));
await importSeeds(app.log);

app.get('/api/health', async () => ({ ok: true }));
await app.register(authRoutes);
await app.register(repertoireRoutes);
await app.register(explorerRoutes);
await app.register(trainingRoutes);
await app.register(gapRoutes);
await app.register(gameRoutes);
await app.register(syncRoutes);

// In production the server also serves the built web app (single container).
const webDist = WEB_DIST;
if (existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    cacheControl: false,
    setHeaders: (res, path) => {
      // Built files have a content hash in their name: cached for good. Stockfish: a day.
      // index.html is always revalidated, so a new version is picked up at once.
      if (path.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (path.includes('/stockfish/')) res.setHeader('Cache-Control', 'public, max-age=86400');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
  );
}

await app.listen({ port: env.port, host: env.host });
