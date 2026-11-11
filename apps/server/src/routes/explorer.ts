import { normaliseExplorerUci, positionFromFen, type ExplorerResponse } from '@prepa-cahier/core';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { explorerCache } from '../db/schema.js';
import { env } from '../env.js';
import { explorerFetch, RateLimited } from '../lichess.js';

const TTL_MS = 7 * 86_400_000;
const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical'] as const;
const RATINGS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];

const query = z.object({
  fen: z.string().min(10).max(120),
  speeds: z.string().transform((s) => s.split(',').filter((x) => (SPEEDS as readonly string[]).includes(x)).sort()),
  ratings: z.string().transform((s) => s.split(',').map(Number).filter((r) => RATINGS.includes(r)).sort((a, b) => a - b)),
});

/** Lichess opening explorer through a shared, cached, rate-limited proxy. */
export async function explorerRoutes(app: FastifyInstance) {
  app.get('/api/explorer', { preHandler: requireUser }, async (req, reply) => {
    const token = req.user!.lichessToken ?? env.lichessAppToken;
    if (!token) return reply.code(409).send({ error: 'Log in with Lichess to see statistics' });
    const q = query.parse(req.query);
    try {
      positionFromFen(q.fen);
    } catch {
      return reply.code(400).send({ error: 'Invalid FEN' });
    }
    if (!q.speeds.length || !q.ratings.length) return reply.code(400).send({ error: 'speeds and ratings required' });

    const params = new URLSearchParams({
      variant: 'standard',
      fen: q.fen,
      speeds: q.speeds.join(','),
      ratings: q.ratings.join(','),
      moves: '20',
      topGames: '0',
      recentGames: '0',
    });
    const key = params.toString();
    const [cached] = await db.select().from(explorerCache).where(eq(explorerCache.key, key));
    if (cached && Date.now() - cached.fetchedAt.getTime() < TTL_MS) return cached.data;

    try {
      const data = (await explorerFetch(`/lichess?${key}`, token)) as ExplorerResponse;
      data.moves = data.moves.map((m) => ({ ...m, uci: normaliseExplorerUci(m.uci, m.san) }));
      const fetchedAt = new Date();
      await db
        .insert(explorerCache)
        .values({ key, data, fetchedAt })
        .onConflictDoUpdate({ target: explorerCache.key, set: { data, fetchedAt } });
      return data;
    } catch (e) {
      if (e instanceof RateLimited) {
        if (cached) return cached.data; // stale is better than nothing
        const seconds = Math.ceil((e.retryAt - Date.now()) / 1000);
        return reply.code(503).header('Retry-After', String(seconds)).send({ error: 'Lichess rate limit', retryAfter: seconds });
      }
      req.log.warn({ err: e }, 'explorer request failed');
      if (cached) return cached.data;
      return reply.code(502).send({ error: 'Lichess explorer unavailable' });
    }
  });
}
