import {
  addMove,
  createRepertoire,
  deleteMove,
  deleteRepertoire,
  exportPgn,
  getRepertoire,
  importPgn,
  listRepertoires,
  saveLine,
  syncRepertoire,
  updateMove,
  updateRepertoire,
} from '@tabiya/data';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';

// The rules live in @tabiya/data (shared with the app running without a server); the routes
// only check the requests.

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.enum(['white', 'black']),
  /** Set by a sync tool (outside this repository): where the repertoire comes from. */
  sourceKey: z.string().trim().min(1).max(200).optional(),
});
const patchBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  /** false: paused (left out of "train all" and of the games analysis). */
  active: z.boolean().optional(),
  /** Set by the sync tool to adopt an existing repertoire (keeps its progress). */
  sourceKey: z.string().trim().min(1).max(200).optional(),
});
const moveBody = z.object({ fromFen: z.string().min(10).max(120), uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/) });
const patchMoveBody = z.object({
  comment: z.string().max(2000).nullable().optional(),
  nags: z.array(z.number().int().min(1).max(255)).max(4).nullable().optional(),
  isMain: z.boolean().optional(),
  paused: z.boolean().optional(),
});
const importBody = z.object({ pgn: z.string().min(1).max(5_000_000) });
const lineBody = z.object({
  /** The variation from the initial position, in UCI. */
  ucis: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).min(1).max(300),
});

type Params = { id: string };
type MoveParams = { id: string; moveId: string };

export async function repertoireRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/api/repertoires', async (req) => listRepertoires(db, req.user!.id));

  app.post('/api/repertoires', async (req, reply) => reply.code(201).send(await createRepertoire(db, req.user!.id, createBody.parse(req.body))));

  app.get<{ Params: Params }>('/api/repertoires/:id', async (req) => getRepertoire(db, req.user!.id, req.params.id));

  app.patch<{ Params: Params }>('/api/repertoires/:id', async (req) => updateRepertoire(db, req.user!.id, req.params.id, patchBody.parse(req.body)));

  app.delete<{ Params: Params }>('/api/repertoires/:id', async (req) => deleteRepertoire(db, req.user!.id, req.params.id));

  /** Adds one move (validated and normalised server-side). */
  app.post<{ Params: Params }>('/api/repertoires/:id/moves', async (req, reply) => {
    const { fromFen, uci } = moveBody.parse(req.body);
    const { row, created } = await addMove(db, req.user!.id, req.params.id, fromFen, uci);
    return created ? reply.code(201).send(row) : row;
  });

  /** Saves a variation from the initial position (see saveLine). */
  app.post<{ Params: Params }>('/api/repertoires/:id/lines', async (req) => saveLine(db, req.user!.id, req.params.id, lineBody.parse(req.body).ucis));

  app.patch<{ Params: MoveParams }>('/api/repertoires/:id/moves/:moveId', async (req) =>
    updateMove(db, req.user!.id, req.params.id, Number(req.params.moveId), patchMoveBody.parse(req.body)),
  );

  /** Deletes a move and everything that is only reachable through it. */
  app.delete<{ Params: MoveParams }>('/api/repertoires/:id/moves/:moveId', async (req) => deleteMove(db, req.user!.id, req.params.id, Number(req.params.moveId)));

  /**
   * Sync from a source (a sync tool outside this repository), keeping the training progress. ?dryRun=1: only answers
   * what would change. ?mode=hard: the repertoire becomes exactly the source.
   */
  app.put<{ Params: Params; Querystring: { dryRun?: string; mode?: string } }>('/api/repertoires/:id/sync', { bodyLimit: 12_000_000 }, async (req) => {
    const { pgn } = z.object({ pgn: z.string().min(1).max(10_000_000) }).parse(req.body);
    return syncRepertoire(db, req.user!.id, req.params.id, pgn, { dryRun: !!req.query.dryRun, mode: req.query.mode === 'hard' ? 'hard' : 'merge' });
  });

  /** Merges a PGN (any number of games, variations included) into the repertoire. */
  app.post<{ Params: Params }>('/api/repertoires/:id/import-pgn', { bodyLimit: 6_000_000 }, async (req) => importPgn(db, req.user!.id, req.params.id, importBody.parse(req.body).pgn));

  app.get<{ Params: Params }>('/api/repertoires/:id/pgn', async (req, reply) => {
    const { pgn, filename } = await exportPgn(db, req.user!.id, req.params.id);
    return reply
      .header('Content-Type', 'application/x-chess-pgn; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}.pgn"`)
      .send(pgn);
  });
}
