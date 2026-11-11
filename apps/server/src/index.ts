import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { authRoutes } from './auth.js';
import { runMigrations } from './db/client.js';
import { env } from './env.js';
import { explorerRoutes } from './routes/explorer.js';
import { repertoireRoutes } from './routes/repertoires.js';
import { trainingRoutes } from './routes/training.js';
import { importSeeds } from './stats.js';

await runMigrations();

const app = Fastify({ logger: { level: env.isProd ? 'info' : 'debug' }, trustProxy: true });
await app.register(cookie, { secret: env.cookieSecret });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: err.issues[0]?.message ?? 'Invalid request', issues: err.issues });
  }
  app.log.error(err);
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  return reply.code(status).send({ error: status < 500 ? (err as Error).message : 'Internal error' });
});

await importSeeds(app.log);

app.get('/api/health', async () => ({ ok: true }));
await app.register(authRoutes);
await app.register(repertoireRoutes);
await app.register(explorerRoutes);
await app.register(trainingRoutes);

// In production the server also serves the built web app (single container).
const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
  );
}

await app.listen({ port: env.port, host: env.host });
