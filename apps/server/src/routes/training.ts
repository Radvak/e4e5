/** Training: spaced-repetition reviews (FSRS) of the positions where it is the user's turn. */
import { Repertoire, trainingPositions } from '@prepa-cahier/core';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createEmptyCard, fsrs, Rating, type CardInput } from 'ts-fsrs';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { repertoires, repMoves, reviewCards } from '../db/schema.js';

const scheduler = fsrs({ enable_fuzz: true });
const GRADES = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;

const reviewBody = z.object({
  fen: z.string().min(10).max(120),
  grade: z.enum(['again', 'hard', 'good', 'easy']),
});
const summaryQuery = z.object({
  /** Start of the user's day (ms), for the daily limit of new positions. */
  dayStart: z.coerce.number().int().nonnegative(),
  newPerDay: z.coerce.number().int().min(0).max(200).default(10),
});

type CardRow = typeof reviewCards.$inferSelect;
const publicCard = (c: CardRow) => ({
  fen: c.fen,
  due: c.due.toISOString(),
  reps: c.reps,
  lapses: c.lapses,
  /** Current interval in days (0 while learning). */
  interval: Number(c.card.scheduled_days ?? 0),
  createdAt: c.createdAt.toISOString(),
});

export async function trainingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  /** Review state of every trained position of a repertoire. */
  app.get<{ Params: { id: string } }>('/api/repertoires/:id/cards', async (req, reply) => {
    const [rep] = await db
      .select({ id: repertoires.id })
      .from(repertoires)
      .where(and(eq(repertoires.id, req.params.id), eq(repertoires.userId, req.user!.id)));
    if (!rep) return reply.code(404).send({ error: 'Repertoire not found' });
    const cards = await db.select().from(reviewCards).where(eq(reviewCards.repertoireId, rep.id));
    return cards.map(publicCard);
  });

  /** Records an answer and schedules the next review of the position. */
  app.post<{ Params: { id: string } }>('/api/repertoires/:id/review', async (req, reply) => {
    const [rep] = await db
      .select()
      .from(repertoires)
      .where(and(eq(repertoires.id, req.params.id), eq(repertoires.userId, req.user!.id)));
    if (!rep) return reply.code(404).send({ error: 'Repertoire not found' });
    const { fen, grade } = reviewBody.parse(req.body);

    const graph = new Repertoire(rep.color, await db.select().from(repMoves).where(eq(repMoves.repertoireId, rep.id)));
    if (!graph.isMyTurn(fen) || graph.movesAt(fen).length === 0) {
      return reply.code(400).send({ error: 'Not a position to train in this repertoire' });
    }
    const [existing] = await db
      .select()
      .from(reviewCards)
      .where(and(eq(reviewCards.repertoireId, rep.id), eq(reviewCards.fen, fen)));
    const now = new Date();
    const { card } = scheduler.next((existing?.card as CardInput | undefined) ?? createEmptyCard(now), now, GRADES[grade]);
    const row = {
      repertoireId: rep.id,
      fen,
      card: JSON.parse(JSON.stringify(card)) as Record<string, unknown>,
      due: card.due,
      reps: card.reps,
      lapses: card.lapses,
      lastReview: now,
    };
    const [saved] = await db
      .insert(reviewCards)
      .values(row)
      .onConflictDoUpdate({
        target: [reviewCards.repertoireId, reviewCards.fen],
        set: { card: row.card, due: row.due, reps: row.reps, lapses: row.lapses, lastReview: row.lastReview },
      })
      .returning();
    return publicCard(saved!);
  });

  /** Per repertoire: positions due now, new positions available today, and total. */
  app.get('/api/training/summary', async (req) => {
    const { dayStart, newPerDay } = summaryQuery.parse(req.query);
    const reps = await db.select().from(repertoires).where(eq(repertoires.userId, req.user!.id));
    if (!reps.length) return [];
    const ids = reps.map((r) => r.id);
    const [moves, cards] = await Promise.all([
      db.select().from(repMoves).where(inArray(repMoves.repertoireId, ids)),
      db.select().from(reviewCards).where(inArray(reviewCards.repertoireId, ids)),
    ]);
    const now = Date.now();
    return reps.map((r) => {
      const positions = new Set(
        trainingPositions(new Repertoire(r.color, moves.filter((m) => m.repertoireId === r.id))).map((p) => p.fen),
      );
      const own = cards.filter((c) => c.repertoireId === r.id && positions.has(c.fen));
      const learntToday = own.filter((c) => c.createdAt.getTime() >= dayStart).length;
      const unseen = positions.size - own.length;
      return {
        repertoireId: r.id,
        total: positions.size,
        due: own.filter((c) => c.due.getTime() <= now).length,
        new: Math.min(unseen, Math.max(0, newPerDay - learntToday)),
      };
    });
  });
}
