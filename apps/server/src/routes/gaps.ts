/**
 * Gap finder ("coups manquants"), see @tabiya/data gaps.ts: on the stored statistics, positions
 * without them fetched from Lichess in the background (`pending`), answers cached until the
 * repertoires, the settings or the stored statistics change.
 */
import { LINE_DEPTHS } from '@tabiya/core';
import { gapsAnalysis } from '@tabiya/data';
import { eq, inArray, sql } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { positionStats, repertoires, repMoves, type User } from '../db/schema.js';
import { env } from '../env.js';
import { prefetchStats, storedStats } from '../stats.js';
import { statsParams } from './explorer.js';

export const gapsQuery = statsParams.extend({
  /** Holes listed, and statistics fetched, from this probability. */
  cutoff: z.coerce.number().min(Math.min(...LINE_DEPTHS)).max(0.2).default(0.01),
});
/** Answers kept until the repertoires, the settings or the stored statistics change. */
const cache = new Map<string, { signature: string; at: number; body: unknown }>();
const CACHE_MS = 10 * 60_000;

export async function gapRoutes(app: FastifyInstance) {
  app.get('/api/gaps', { preHandler: requireUser }, async (req, reply) => {
    const q = gapsQuery.parse(req.query);
    if (!q.speeds.length || !q.ratings.length) return reply.code(400).send({ error: 'speeds and ratings required' });
    return gapsReport(req.user!, q, req.log);
  });
}

/** The gap finder report of a user (both colours), for statistics settings `q`. */
export async function gapsReport(user: User, q: z.infer<typeof gapsQuery>, log: FastifyBaseLogger) {
  const userId = user.id;
  const reps = await db.select().from(repertoires).where(eq(repertoires.userId, userId));
  const token = user.lichessToken ?? env.lichessAppToken;

  // Cheap signature of what the answer depends on: the moves (added / deleted), the
  // repertoires (colour), and the stored statistics (they grow with background fetches).
  const ids = reps.map((r) => r.id);
  const [sig] = ids.length
    ? await db
        .select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(${repMoves.id}), 0)` })
        .from(repMoves)
        .where(inArray(repMoves.repertoireId, ids))
    : [{ n: 0, sum: 0 }];
  const [stats] = await db.select({ n: sql<number>`count(*)` }).from(positionStats);
  const key = `${userId}|${q.speeds.join(',')}|${q.ratings.join(',')}|${q.cutoff}`;
  const signature = [reps.map((r) => `${r.id}:${r.color}`).join(','), sig!.n, sig!.sum, stats!.n].join('|');
  const hit = cache.get(key);
  if (hit && hit.signature === signature && Date.now() - hit.at < CACHE_MS) return hit.body as typeof body;

  const analysis = await gapsAnalysis(
    db,
    userId,
    q,
    (fens) => storedStats(fens, q.speeds, q.ratings),
    token ? (fens) => prefetchStats(fens, q.speeds, q.ratings, token, log) : undefined,
  );
  const body = { live: !!token, ...analysis };
  // Not cached while statistics are being fetched: the next call must see them.
  if (!body.white?.pending && !body.black?.pending) cache.set(key, { signature, at: Date.now(), body });
  return body;
}
