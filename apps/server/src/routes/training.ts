/**
 * Training: spaced-repetition reviews (FSRS) of my moves. The rules are in @tabiya/data
 * (training.ts), shared with the app running without a server: these routes check the requests.
 */
import { GRADES } from '@tabiya/core';
import { listCards, recordAnswer, reviewNow } from '@tabiya/data';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';

const reviewBody = z.object({
  fen: z.string().min(10).max(120),
  uci: z.string().min(4).max(5),
  grade: z.enum(GRADES),
  /** Id given by the device to this answer (sent again after a lost connection: recorded once). */
  id: z.string().min(8).max(64).optional(),
  /** When the answer was given (ms), for answers sent later (offline). Default: now. */
  reviewedAt: z.number().int().positive().optional(),
});

export async function trainingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  /** Review state of every learnt move of the user. */
  app.get('/api/cards', async (req) => listCards(db, req.user!.id));

  /** Records an answer (the move asked in a position of the repertoire) and schedules its next review. */
  app.post<{ Params: { id: string } }>('/api/repertoires/:id/review', async (req) =>
    recordAnswer(db, req.user!.id, req.params.id, reviewBody.parse(req.body)),
  );

  /** Makes my learnt moves of a position due for review now (e.g. after a deviation in a game). */
  app.post<{ Params: { id: string } }>('/api/repertoires/:id/cards/due', async (req) => {
    const { fen } = z.object({ fen: z.string().min(10).max(120) }).parse(req.body);
    return reviewNow(db, req.user!.id, req.params.id, fen);
  });
}
