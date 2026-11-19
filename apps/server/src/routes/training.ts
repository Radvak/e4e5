/**
 * Training: spaced-repetition reviews (FSRS) of my moves, in the positions where it is my turn.
 * A move card belongs to the user, not to a repertoire: a move learnt once is known everywhere.
 *
 * The app schedules each answer on the device at once (core fsrs.ts, offline too) and sends it
 * here, possibly later: with its own id (an answer sent twice counts once) and the time it was
 * given, so the server computes the same card.
 */
import { GRADES, recallOf, Repertoire, scheduleReview } from '@tabiya/core';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { moveCards, repertoires, repMoves, reviewLog } from '../db/schema.js';
import { makeDue } from '../moveCards.js';

const reviewBody = z.object({
  fen: z.string().min(10).max(120),
  uci: z.string().min(4).max(5),
  grade: z.enum(GRADES),
  /** Id given by the device to this answer (sent again after a lost connection: recorded once). */
  id: z.string().min(8).max(64).optional(),
  /** When the answer was given (ms), for answers sent later (offline). Default: now. */
  reviewedAt: z.number().int().positive().optional(),
});

type CardRow = typeof moveCards.$inferSelect;
const publicCard = (c: CardRow, now = new Date()) => ({
  fen: c.fen,
  uci: c.uci,
  /** Estimated probability (0-1) of finding the move now (FSRS retrievability). */
  recall: recallOf(c.card, c.reps, now),
  due: c.due.toISOString(),
  reps: c.reps,
  lapses: c.lapses,
  /** Current interval in days (0 while learning). */
  interval: Number(c.card.scheduled_days ?? 0),
  createdAt: c.createdAt.toISOString(),
  /** The FSRS card itself, to schedule the next answers on the device. */
  fsrs: c.card,
});

export async function trainingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  /** Review state of every learnt move of the user. */
  app.get('/api/cards', async (req) => {
    const cards = await db.select().from(moveCards).where(eq(moveCards.userId, req.user!.id));
    const now = new Date();
    return cards.map((c) => publicCard(c, now));
  });

  /** Records an answer (the move asked in a position of the repertoire) and schedules its next review. */
  app.post<{ Params: { id: string } }>('/api/repertoires/:id/review', async (req, reply) => {
    const userId = req.user!.id;
    const [rep] = await db
      .select()
      .from(repertoires)
      .where(and(eq(repertoires.id, req.params.id), eq(repertoires.userId, userId)));
    if (!rep) return reply.code(404).send({ error: 'Répertoire introuvable' });
    const { fen, uci, grade, id, reviewedAt } = reviewBody.parse(req.body);

    const graph = new Repertoire(rep.color, await db.select().from(repMoves).where(eq(repMoves.repertoireId, rep.id)));
    if (!graph.isMyTurn(fen) || !graph.movesAt(fen).some((m) => m.uci === uci)) {
      return reply.code(400).send({ error: 'Pas un coup à entraîner dans ce répertoire' });
    }
    const key = and(eq(moveCards.userId, userId), eq(moveCards.fen, fen), eq(moveCards.uci, uci));
    const [existing] = await db.select().from(moveCards).where(key);
    const now = new Date();
    // The time of the answer, not before the card's last review (answers are sent in order) nor
    // in the future (device clock ahead).
    const at = new Date(Math.min(now.getTime(), Math.max(reviewedAt ?? now.getTime(), existing?.lastReview?.getTime() ?? 0)));
    // Recorded once per id: the same answer sent again leaves the card as it is.
    const logged = await db
      .insert(reviewLog)
      .values({ repertoireId: rep.id, fen, uci, grade, isNew: !existing, reviewedAt: at, clientId: id ?? null })
      .onConflictDoNothing({ target: reviewLog.clientId })
      .returning({ id: reviewLog.id });
    if (!logged.length && existing) return publicCard(existing, now);
    const next = scheduleReview(existing?.card, grade, at);
    const row = { userId, fen, uci, card: next.card, due: next.due, reps: next.reps, lapses: next.lapses, lastReview: at };
    const [saved] = await db
      .insert(moveCards)
      .values({ ...row, createdAt: at })
      .onConflictDoUpdate({
        target: [moveCards.userId, moveCards.fen, moveCards.uci],
        set: { card: row.card, due: row.due, reps: row.reps, lapses: row.lapses, lastReview: row.lastReview },
      })
      .returning();
    return publicCard(saved!);
  });

  /** Makes my learnt moves of a position due for review now (e.g. after a deviation in a game). */
  app.post<{ Params: { id: string } }>('/api/repertoires/:id/cards/due', async (req, reply) => {
    const [rep] = await db
      .select({ id: repertoires.id })
      .from(repertoires)
      .where(and(eq(repertoires.id, req.params.id), eq(repertoires.userId, req.user!.id)));
    if (!rep) return reply.code(404).send({ error: 'Répertoire introuvable' });
    const { fen } = z.object({ fen: z.string().min(10).max(120) }).parse(req.body);
    if (!(await makeDue(req.user!.id, rep.id, fen))) {
      return reply.code(404).send({ error: 'Cette position n’est pas encore apprise : entraînez-la d’abord' });
    }
    return { ok: true };
  });
}
