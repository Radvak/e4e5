import { fenKey, positionFromFen, RATING_BUCKETS, type ExplorerResponse } from '@tabiya/core';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { repertoires, repMoves } from '../db/schema.js';
import { env } from '../env.js';
import { exportGame, explorerFetch, explorerStream, RateLimited } from '../lichess.js';
import { getStats, prefetchStats, slim } from '../stats.js';
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
   * (`suggestMoves`). The positions of the next step are fetched in the background and
   * `pending` says to ask again; positions stored for another range are fetched for the asked
   * one once the search is complete.
   */
  app.get('/api/explorer/best', { preHandler: requireUser }, async (req, reply) => {
    const q = query.parse(req.query);
    const root = parseFen(q.fen);
    if (!root) return reply.code(400).send({ error: 'FEN invalide' });
    if (!q.speeds.length || !q.ratings.length) return reply.code(400).send({ error: 'speeds and ratings required' });
    const token = req.user!.lichessToken ?? env.lichessAppToken;
    const first = await getStats(root, q.speeds, q.ratings, token, req.log);
    if (!first.data) return { moves: [], reach: null, target: REACH_STEPS.at(-1)!, steps: REACH_STEPS, pending: 0 };
    const { missing, approximate, ...found } = await suggestMoves(root, { data: first.data, exact: first.meta.exact }, q.speeds, q.ratings);
    const toFetch = missing.length ? missing : found.reach === found.target ? approximate : [];
    const pending = token && toFetch.length ? prefetchStats(toFetch, q.speeds, q.ratings, token, req.log) : 0;
    return { ...found, steps: REACH_STEPS, pending };
  });

  /** Top and recent games of the position (Lichess players at that level). Not stored. */
  app.get('/api/explorer/games', { preHandler: requireUser }, async (req, reply) => {
    const q = query.parse(req.query);
    const fen = parseFen(q.fen);
    if (!fen) return reply.code(400).send({ error: 'FEN invalide' });
    const token = req.user!.lichessToken ?? env.lichessAppToken;
    if (!token) return reply.code(409).send({ error: 'Liez Lichess dans les paramètres pour voir les parties', reason: 'no-token' });
    const params = new URLSearchParams({
      variant: 'standard',
      fen,
      speeds: q.speeds.join(','),
      ratings: q.ratings.join(','),
      moves: '0',
      topGames: '4',
      recentGames: '4',
    });
    try {
      const raw = (await explorerFetch(`/lichess?${params}`, token)) as { topGames?: ExplorerGame[]; recentGames?: ExplorerGame[] };
      return { topGames: (raw.topGames ?? []).map(game), recentGames: (raw.recentGames ?? []).map(game) };
    } catch (e) {
      return lichessError(e, reply);
    }
  });

  /**
   * The user's own Lichess games in this position (Lichess "player" explorer): move statistics
   * and recent games. The first request indexes the games: `done: false` means ask again.
   */
  app.get('/api/explorer/mine', { preHandler: requireUser }, async (req, reply) => {
    const q = z
      .object({
        fen: z.string().min(10).max(120),
        color: z.enum(['white', 'black']),
        speeds: statsParams.shape.speeds,
      })
      .parse(req.query);
    const fen = parseFen(q.fen);
    if (!fen) return reply.code(400).send({ error: 'FEN invalide' });
    const user = req.user!;
    if (!user.lichessUsername) return reply.code(409).send({ error: 'Liez votre compte Lichess dans les paramètres', reason: 'no-lichess' });
    const token = user.lichessToken ?? env.lichessAppToken;
    if (!token) return reply.code(409).send({ error: 'Liez Lichess dans les paramètres', reason: 'no-token' });
    const params = new URLSearchParams({
      variant: 'standard',
      player: user.lichessUsername,
      color: q.color,
      fen: `${fen} 0 1`,
      recentGames: '8',
      ...(q.speeds.length ? { speeds: q.speeds.join(',') } : {}),
    });
    try {
      const { data, done } = await explorerStream(`/player?${params}`, token, 8000);
      const raw = (data ?? { white: 0, draws: 0, black: 0, moves: [] }) as ExplorerResponse & { recentGames?: ExplorerGame[] };
      return { player: user.lichessUsername, done, data: slim(raw), recentGames: (raw.recentGames ?? []).map(game) };
    } catch (e) {
      return lichessError(e, reply);
    }
  });

  /** Moves prepared in this position in any of the user's repertoires (both colours). */
  app.get('/api/explorer/repertoires', { preHandler: requireUser }, async (req, reply) => {
    const fen = parseFen(z.object({ fen: z.string().min(10).max(120) }).parse(req.query).fen);
    if (!fen) return reply.code(400).send({ error: 'FEN invalide' });
    return db
      .select({
        repertoireId: repertoires.id,
        name: repertoires.name,
        color: repertoires.color,
        uci: repMoves.uci,
        san: repMoves.san,
        isMain: repMoves.isMain,
        comment: repMoves.comment,
      })
      .from(repMoves)
      .innerJoin(repertoires, eq(repMoves.repertoireId, repertoires.id))
      .where(and(eq(repertoires.userId, req.user!.id), eq(repMoves.fromFen, fen)));
  });

  /** A Lichess game, to replay it on the board. */
  app.get<{ Params: { id: string } }>('/api/lichess-games/:id', { preHandler: requireUser }, async (req, reply) => {
    if (!/^[a-zA-Z0-9]{8}$/.test(req.params.id)) return reply.code(400).send({ error: 'Invalid game id' });
    let g;
    try {
      g = await exportGame(req.params.id);
    } catch (e) {
      return lichessError(e, reply);
    }
    return {
      id: g.id,
      white: { name: g.players.white.user?.name ?? 'Anonymous', rating: g.players.white.rating ?? null },
      black: { name: g.players.black.user?.name ?? 'Anonymous', rating: g.players.black.rating ?? null },
      winner: g.winner ?? null,
      status: g.status,
      speed: g.speed,
      date: new Date(g.createdAt).toISOString(),
      moves: g.moves.split(' ').filter(Boolean),
    };
  });
}

/** Game reference as sent by the Lichess explorer. */
interface ExplorerGame {
  id: string;
  uci?: string;
  winner: 'white' | 'black' | null;
  speed?: string;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  year: number;
  month?: string;
}

const game = (g: ExplorerGame) => ({
  id: g.id,
  winner: g.winner,
  speed: g.speed ?? null,
  white: g.white,
  black: g.black,
  month: g.month ?? String(g.year),
  /** Move played in the position (Lichess players database only). */
  uci: g.uci ?? null,
});

function parseFen(raw: string): string | null {
  try {
    return fenKey(positionFromFen(raw));
  } catch {
    return null;
  }
}

/** Lichess errors as answers the page can show (rate limit, or Lichess unreachable / failing). */
function lichessError(e: unknown, reply: FastifyReply) {
  if (e instanceof RateLimited) return reply.code(429).send({ error: 'Limite de Lichess atteinte, réessayez dans une minute', reason: 'rate-limited' });
  reply.log.warn({ err: e }, 'Lichess request failed');
  const status = (e as { statusCode?: number }).statusCode;
  if (status === 404) return reply.code(404).send({ error: 'Partie introuvable sur Lichess' });
  return reply.code(502).send({ error: 'Lichess est injoignable', reason: 'unreachable' });
}
