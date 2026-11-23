/**
 * The statistics files per rating bucket (scripts/split-stats.ts), for the app to download and
 * read on the device: `index.json` and `stats-<bucket>.db.gz`. Public data, no login. Served from
 * here during the migration; later from static hosting (the app's VITE_STATS_URL).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';

const NAME = /^(index\.json|stats-\d{1,4}\.db\.gz)$/;

export async function statsFileRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>('/api/stats-files/:name', async (req, reply) => {
    const { name } = req.params;
    const path = join(env.statsFilesDir, name);
    if (!NAME.test(name) || !existsSync(path)) return reply.code(404).send({ error: 'Fichier de statistiques introuvable' });
    const json = name.endsWith('.json');
    return reply
      .header('Content-Type', json ? 'application/json' : 'application/gzip')
      .header('Content-Length', statSync(path).size)
      .header('Cache-Control', json ? 'no-cache' : 'public, max-age=86400')
      .send(createReadStream(path));
  });
}
