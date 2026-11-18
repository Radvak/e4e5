import { existsSync } from 'node:fs';
import { constants as zlib } from 'node:zlib';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { authRoutes } from './auth.js';
import { runMigrations } from './db/client.js';
import { env } from './env.js';
import { WEB_DIST } from './paths.js';
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
  app.log.error(err);
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  return reply.code(status).send({ error: status < 500 ? (err as Error).message : 'Erreur interne' });
});

await importSeeds(app.log);

app.get('/api/health', async () => ({ ok: true }));
// Digital Asset Links of the Android app (Trusted Web Activity): empty list without fingerprints.
app.get('/.well-known/assetlinks.json', async (_req, reply) => {
  reply.header('Cache-Control', 'public, max-age=3600');
  return env.androidSha256Fingerprints.length === 0
    ? []
    : [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: env.androidPackage,
            sha256_cert_fingerprints: env.androidSha256Fingerprints,
          },
        },
      ];
});
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
