/**
 * Gap finder ("coups manquants"): the frequent opponent moves the repertoires do not answer.
 *
 * All repertoires of one colour are analysed together, as one merged graph: a line prepared in
 * any of them is not a hole for the others. Each hole is then given to the repertoire going
 * furthest along its line, past that repertoire's trunk (`gapOwner`), or to none.
 *
 * Runs on stored statistics only (stats.ts: Lichess is never asked), so it answers at once. A
 * position without any stored statistics ends its line; one stored for another range only is
 * used as such (`approximate`). `pending` is always 0.
 */
import { findGaps, gapCandidate, LINE_DEPTHS, Repertoire, rankRepertoires, turnOf, type Color } from '@tabiya/core';
import { eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { graphColumns, positionStats, repertoires, repMoves, type User } from '../db/schema.js';
import { storedStats } from '../stats.js';
import { statsParams } from './explorer.js';

export const gapsQuery = statsParams.extend({
  /** Holes listed, and statistics fetched, from this probability. */
  cutoff: z.coerce.number().min(Math.min(...LINE_DEPTHS)).max(0.2).default(0.01),
});
/**
 * The analysis explores down to a quarter of the smallest depth of the lines (or of the listed
 * cutoff): enough for the holes (a hole reached by several move orders adds up) and for the
 * positions trained at each depth (Paramètres shows them all). Stored statistics only, so cheap;
 * fetches stay at the asked cutoff.
 */
const exploreFor = (cutoff: number) => Math.min(cutoff, ...LINE_DEPTHS) / 4;
/** Answers kept until the repertoires, the settings or the stored statistics change. */
const cache = new Map<string, { signature: string; at: number; body: unknown }>();
const CACHE_MS = 10 * 60_000;
/** Per colour (shared by its repertoires). */
const MAX_GAPS = 200;

export async function gapRoutes(app: FastifyInstance) {
  app.get('/api/gaps', { preHandler: requireUser }, async (req, reply) => {
    const q = gapsQuery.parse(req.query);
    if (!q.speeds.length || !q.ratings.length) return reply.code(400).send({ error: 'speeds and ratings required' });
    return gapsReport(req.user!, q);
  });
}

/** The gap finder report of a user (both colours), for statistics settings `q`. */
export async function gapsReport(user: User, q: z.infer<typeof gapsQuery>) {
  const userId = user.id;
  const reps = await db.select().from(repertoires).where(eq(repertoires.userId, userId));
  const EXPLORE = exploreFor(q.cutoff);

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

  const moves = ids.length ? await db.select(graphColumns).from(repMoves).where(inArray(repMoves.repertoireId, ids)) : [];

  const analyse = async (color: Color) => {
    const own = reps.filter((r) => r.color === color);
    if (!own.length) return null;
    const ids = new Set(own.map((r) => r.id));
    const colorMoves = moves.filter((m) => ids.has(m.repertoireId));
    const merged = new Repertoire(color, colorMoves);
    // Only opponent positions of the repertoire need statistics.
    const opponentFens = [...new Set(colorMoves.map((m) => m.fromFen))].filter((f) => turnOf(f) !== color);
    const stored = await storedStats(opponentFens, q.speeds, q.ratings);
    const statsAt = (fen: string) => stored.get(fen)?.data;
    // Each of my moves carries the whole probability: how often a position comes up if I play its
    // line (two repertoires 1. e4 and 1. d4 do not halve each other's positions and holes).
    const report = findGaps(merged, statsAt, { cutoff: EXPLORE, split: false });

    const approximate = report.usedStats.filter((f) => !stored.get(f)!.exact);

    const candidates = own.map((r) => gapCandidate(r.id, new Repertoire(color, colorMoves.filter((m) => m.repertoireId === r.id))));
    return {
      truncated: report.truncated,
      /** Positions analysed with statistics of another range (exact ones not stored yet). */
      approximate: approximate.length,
      /** Positions without any statistics, reached often enough to matter (their lines end there). */
      missing: report.missingStats.filter((m) => m.prob >= q.cutoff).length,
      /** Nothing is fetched (kept for the clients asking again while some were). */
      pending: 0,
      /**
       * Probability of reaching each position of the repertoire if I play its line (capped at 1:
       * move orders of mine meeting again add up), explored down to EXPLORE: orders
       * the new positions by how often they come up, and stops the lines (core keptPositions,
       * which needs the opponent's positions too to bound the ones without statistics).
       */
      reach: Object.fromEntries([...report.reached].map(([fen, p]) => [fen, Math.round(Math.min(1, p) * 1e6) / 1e6])),
      gaps: report.gaps
        .filter((g) => g.prob >= q.cutoff)
        .slice(0, MAX_GAPS)
        .map((g) => {
          const ranking = rankRepertoires(g, candidates);
          return {
            kind: g.kind,
            fen: g.fen,
            move: g.move ?? null,
            prob: Math.min(1, g.prob),
            line: g.path.map((m) => m.san),
            ucis: g.path.map((m) => m.uci),
            /** null: a deviation inside every repertoire's trunk (belongs to none of them). */
            repertoireId: ranking[0]?.owns ? ranking[0].key : null,
            /** Every repertoire of the colour, best suited first (to prepare the hole in). */
            ranking: ranking.map((r) => r.key),
          };
        }),
    };
  };

  const body = { white: await analyse('white'), black: await analyse('black') };
  cache.set(key, { signature, at: Date.now(), body });
  return body;
}
