import { fenKey, positionFromFen, RATING_BUCKETS } from '@tabiya/core';
import { positionRepertoires, repertoireMovesAt } from '@tabiya/data';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { myGameMoves, myGamesAt } from '../myGames.js';
import { openingOfUcis } from '../openings.js';
import { getStudy, getStudyPreview, searchStudies, StudyError } from '../lichessStudies.js';
import { getStats, prefetchStats } from '../stats.js';
import { REACH_STEPS, suggestMoves } from '../suggest.js';

const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical'];
const RATINGS: readonly number[] = RATING_BUCKETS;
/** Speeds and rating buckets of an explorer request, validated, deduplicated and sorted. */
export const statsParams = z.object({
  speeds: z.string().transform((s) => [...new Set(s.split(','))].filter((x) => SPEEDS.includes(x)).sort()),
  ratings: z
    .string()
    .transform((s) => [...new Set(s.split(',').map(Number))].filter((r) => RATINGS.includes(r)).sort((a, b) => a - b)),
});
const query = statsParams.extend({ fen: z.string().min(10).max(120) });

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
      return reply.code(400).send({ error: 'FEN invalide' });
    }
    if (!q.speeds.length || !q.ratings.length) return reply.code(400).send({ error: 'speeds and ratings required' });
    const token = req.user!.lichessToken ?? env.lichessAppToken;
    const result = await getStats(fen, q.speeds, q.ratings, token, req.log);
    if (!result.data) return reply.code(404).send({ error: 'Aucune statistique pour cette position', reason: result.reason });
    return result;
  });

  /**
   * Suggested moves for the side to move: best expected score over the likely lines
   * (`suggestMoves`); with `color` the other side, the opponent's moves scored for me. The positions of the next step are fetched in the background and
   * `pending` says to ask again; positions stored for another range are fetched for the asked
   * one once the search is complete.
   */
  app.get('/api/explorer/best', { preHandler: requireUser }, async (req, reply) => {
    const q = query
      .extend({
        depth: z.coerce.number().int().min(0).max(REACH_STEPS.length).default(REACH_STEPS.length),
        // My side (default: the side to move); on the opponent's turn, its moves are scored for me.
        color: z.enum(['white', 'black']).optional(),
      })
      .parse(req.query);
    const root = parseFen(q.fen);
    if (!root) return reply.code(400).send({ error: 'FEN invalide' });
    if (!q.speeds.length || !q.ratings.length) return reply.code(400).send({ error: 'speeds and ratings required' });
    const token = req.user!.lichessToken ?? env.lichessAppToken;
    const first = await getStats(root, q.speeds, q.ratings, token, req.log);
    if (!first.data) return { moves: [], reach: null, target: REACH_STEPS.at(-1)!, steps: REACH_STEPS, pending: 0 };
    const { missing, approximate, ...found } = await suggestMoves(root, { data: first.data, exact: first.meta.exact }, q.speeds, q.ratings, q.depth, q.color);
    const toFetch = missing.length ? missing : found.reach === found.target ? approximate : [];
    const pending = token && toFetch.length ? prefetchStats(toFetch, q.speeds, q.ratings, token, req.log) : 0;
    return { ...found, steps: REACH_STEPS, pending };
  });

  /**
   * The user's own games in this position, Lichess and Chess.com (the synced games, see
   * myGames.ts): move statistics and recent games.
   */
  app.get('/api/explorer/mine', { preHandler: requireUser }, async (req, reply) => {
    const q = z
      .object({
        fen: z.string().min(10).max(120),
        color: z.enum(['white', 'black']),
        speeds: z.string().transform((s) => s.split(',').filter(Boolean)),
        days: z.coerce.number().int().min(0).max(3650).default(0),
      })
      .parse(req.query);
    const fen = parseFen(q.fen);
    if (!fen) return reply.code(400).send({ error: 'FEN invalide' });
    const user = req.user!;
    return myGamesAt(user.id, { lichess: user.lichessUsername, chesscom: user.chesscomUsername }, { ...q, fen });
  });

  /** Public Lichess studies (to create a repertoire from one): ?q= (empty: all), most liked first. */
  app.get('/api/lichess/studies', { preHandler: requireUser }, async (req, reply) => {
    const q = z.object({ q: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100).default(1) }).parse(req.query);
    try {
      return await searchStudies(q.q, q.page);
    } catch (e) {
      if (e instanceof StudyError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  /** A public Lichess study, chapter by chapter (PGN, side, whether it joins the others). */
  app.get<{ Params: { id: string } }>('/api/lichess/studies/:id', { preHandler: requireUser }, async (req, reply) => {
    if (!/^[A-Za-z0-9]{8}$/.test(req.params.id)) return reply.code(400).send({ error: 'Identifiant d’étude invalide' });
    try {
      return await getStudy(req.params.id);
    } catch (e) {
      if (e instanceof StudyError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  /** The card of a study in the catalogue: side, chapters, moves, thumbnail. */
  app.get<{ Params: { id: string } }>('/api/lichess/studies/:id/preview', { preHandler: requireUser }, async (req, reply) => {
    if (!/^[A-Za-z0-9]{8}$/.test(req.params.id)) return reply.code(400).send({ error: 'Identifiant d’étude invalide' });
    try {
      return await getStudyPreview(req.params.id);
    } catch (e) {
      if (e instanceof StudyError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  /** The moves of one of the user's synced games, to replay it on the board. */
  app.get<{ Params: { id: string } }>('/api/my-games/:id', { preHandler: requireUser }, async (req, reply) => {
    const moves = await myGameMoves(req.user!.id, req.params.id);
    return moves ? { moves } : reply.code(404).send({ error: 'Partie introuvable' });
  });

  /** Name of the opening of a line (?line=e2e4,e7e5): its last named position; null if none. */
  app.get('/api/explorer/opening', { preHandler: requireUser }, async (req) => {
    const { line } = z.object({ line: z.string().max(2000).default('') }).parse(req.query);
    const opening = openingOfUcis(line ? line.split(',') : []);
    return opening && { eco: opening.eco, name: opening.name };
  });

  /** Moves prepared in this position in any of the user's repertoires (both colours). */
  app.get('/api/explorer/repertoires', { preHandler: requireUser }, async (req) =>
    repertoireMovesAt(db, req.user!.id, z.object({ fen: z.string().min(10).max(120) }).parse(req.query).fen),
  );

  /** The repertoires containing this position, with the number of their moves from here. */
  app.get('/api/explorer/position-repertoires', { preHandler: requireUser }, async (req) =>
    positionRepertoires(db, req.user!.id, z.object({ fen: z.string().min(10).max(120) }).parse(req.query).fen),
  );
}

function parseFen(raw: string): string | null {
  try {
    return fenKey(positionFromFen(raw));
  } catch {
    return null;
  }
}
