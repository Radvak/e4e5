/**
 * Gap finder: expected preparation depth, reach probability of each repertoire, and top holes.
 *
 * All repertoires of one colour are analysed together, as one merged graph: a line prepared in
 * any of them is not a hole for the others. Each hole is then given to the repertoire going
 * furthest along its line, past that repertoire's trunk (`gapOwner`), or to none.
 *
 * Runs on stored statistics only, so it answers at once. Positions the analysis needs without
 * stored data for the requested range are fetched in the background (`pending`): the client
 * asks again until nothing is pending, and each pass may reach deeper positions.
 */
import { findGaps, gapCandidate, Repertoire, rankRepertoires, turnOf, type Color, type PrepEnd } from '@prepa-cahier/core';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { repertoires, repMoves } from '../db/schema.js';
import { env } from '../env.js';
import { prefetchStats, storedStats } from '../stats.js';
import { statsParams } from './explorer.js';

const gapsQuery = statsParams.extend({
  /** Holes listed, and statistics fetched, from this probability. */
  cutoff: z.coerce.number().min(0.002).max(0.2).default(0.01),
});
/** The analysis itself explores down to this probability (depth figures barely depend on it). */
const EXPLORE = 0.0001;
/** Per colour (shared by its repertoires). */
const MAX_GAPS = 200;

export async function gapRoutes(app: FastifyInstance) {
  app.get('/api/gaps', { preHandler: requireUser }, async (req, reply) => {
    const q = gapsQuery.parse(req.query);
    if (!q.speeds.length || !q.ratings.length) return reply.code(400).send({ error: 'speeds and ratings required' });
    const reps = await db.select().from(repertoires).where(eq(repertoires.userId, req.user!.id));
    const moves = reps.length ? await db.select().from(repMoves).where(inArray(repMoves.repertoireId, reps.map((r) => r.id))) : [];
    const token = req.user!.lichessToken ?? env.lichessAppToken;

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
      const ends: PrepEnd[] = [];
      const report = findGaps(merged, statsAt, { cutoff: EXPLORE, onEnd: (e) => ends.push(e) });

      // Fetched in the background: positions without exact statistics, reached often enough.
      const often = (fen: string) => (report.reached.get(fen) ?? 0) >= q.cutoff;
      const approximate = report.usedStats.filter((f) => !stored.get(f)!.exact);
      const toFetch = [...report.missingStats.map((m) => m.fen), ...approximate].filter(often);
      const pending = token ? prefetchStats(toFetch, q.speeds, q.ratings, token, req.log) : 0;

      const candidates = own.map((r) => gapCandidate(r.id, new Repertoire(color, colorMoves.filter((m) => m.repertoireId === r.id))));
      // Each game ends its preparation somewhere: that place goes to the best suited repertoire.
      const perRep = new Map<string | null, { share: number; plies: number }>();
      for (const e of ends) {
        const best = rankRepertoires(e, candidates)[0];
        const key = best?.owns ? best.key : null;
        const acc = perRep.get(key) ?? { share: 0, plies: 0 };
        acc.share += e.prob;
        acc.plies += e.prob * e.ply;
        perRep.set(key, acc);
      }
      const summary = (key: string | null) => {
        const acc = perRep.get(key) ?? { share: 0, plies: 0 };
        return { share: acc.share, depth: acc.share ? acc.plies / acc.share / 2 : 0 };
      };
      return {
        /** Expected number of moves played in the preparation (a lower bound when `unknown` > 0). */
        depth: report.depth / 2,
        lost: report.lost,
        ends: report.ends,
        /** Share of games reaching positions without statistics. */
        unknown: report.unknown,
        truncated: report.truncated,
        /** Positions analysed with statistics of another range (exact ones not stored yet). */
        approximate: approximate.length,
        /** Positions without any statistics. */
        missing: report.missingStats.length,
        /** Positions being fetched in the background: ask again later. */
        pending,
        /**
         * Per repertoire: share of the games whose preparation ends in it, and their expected
         * number of moves in the preparation. The shares add up to 100% with `unowned`.
         */
        repertoires: own.map((r) => ({ id: r.id, ...summary(r.id) })),
        /** Games whose preparation ends inside every repertoire's trunk. */
        unowned: summary(null),
        gaps: report.gaps
          .filter((g) => g.prob >= q.cutoff)
          .slice(0, MAX_GAPS)
          .map((g) => {
            const ranking = rankRepertoires(g, candidates);
            return {
              kind: g.kind,
              fen: g.fen,
              move: g.move ?? null,
              prob: g.prob,
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

    return { live: !!token, white: await analyse('white'), black: await analyse('black') };
  });
}
