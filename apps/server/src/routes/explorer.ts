import { fenKey, positionFromFen, RATING_BUCKETS } from '@prepa-cahier/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { env } from '../env.js';
import { getStats } from '../stats.js';

const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical'];
const RATINGS: readonly number[] = RATING_BUCKETS;

const query = z.object({
  fen: z.string().min(10).max(120),
  speeds: z.string().transform((s) => [...new Set(s.split(','))].filter((x) => SPEEDS.includes(x)).sort()),
  ratings: z
    .string()
    .transform((s) => [...new Set(s.split(',').map(Number))].filter((r) => RATINGS.includes(r)).sort((a, b) => a - b)),
});

/**
 * Position statistics: shared table first, then Lichess (user token, else the app token), then
 * the closest stored combination. Answers { data, meta } or 404 { reason } if nothing is known.
 */
export async function explorerRoutes(app: FastifyInstance) {
  app.get('/api/explorer', { preHandler: requireUser }, async (req, reply) => {
    const q = query.parse(req.query);
    let fen: string;
    try {
      fen = fenKey(positionFromFen(q.fen));
    } catch {
      return reply.code(400).send({ error: 'Invalid FEN' });
    }
    if (!q.speeds.length || !q.ratings.length) return reply.code(400).send({ error: 'speeds and ratings required' });
    const token = req.user!.lichessToken ?? env.lichessAppToken;
    const result = await getStats(fen, q.speeds, q.ratings, token, req.log);
    if (!result.data) return reply.code(404).send({ error: 'No statistics for this position', reason: result.reason });
    return result;
  });
}
