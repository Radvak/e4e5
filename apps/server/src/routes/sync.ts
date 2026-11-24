/**
 * Routes of a sync tool (outside this repository) that are not tied to one user: position statistics
 * computed from Lichess games, shared by every account. Protected by the SYNC_TOKEN secret.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { importEntries } from '../stats.js';

const count = z.number().int().nonnegative();
const entry = z.object({
  fen: z.string().min(10).max(120),
  speeds: z.array(z.string()).min(1),
  ratings: z.array(z.number().int()).min(1),
  fetchedAt: z.number().int().positive(),
  data: z.object({
    white: count,
    draws: count,
    black: count,
    moves: z.array(z.object({ uci: z.string(), san: z.string(), white: count, draws: count, black: count })).max(60),
    opening: z.object({ eco: z.string(), name: z.string() }).nullable().optional(),
  }),
});

const authorized = (header: string | undefined) => {
  if (!env.syncToken || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(env.syncToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

export async function syncRoutes(app: FastifyInstance) {
  /** Position statistics (Lichess explorer format), stored like the seeds (newest wins). */
  app.post('/api/sync/stats', { bodyLimit: 40_000_000 }, async (req, reply) => {
    if (!env.syncToken) return reply.code(404).send({ error: 'Import désactivé (SYNC_TOKEN non défini)' });
    if (!authorized(req.headers.authorization)) return reply.code(401).send({ error: 'Jeton invalide' });
    const { entries } = z.object({ entries: z.array(entry).max(20_000) }).parse(req.body);
    const written = await importEntries(entries, 'import');
    return { received: entries.length, written };
  });
}
