/** Training: spaced-repetition reviews (FSRS) of the positions where it is the user's turn. */
import { groupLines, lineStarts, Repertoire, trainingPositions } from '@prepa-cahier/core';
import { and, eq, gte, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createEmptyCard, fsrs, Rating, type CardInput } from 'ts-fsrs';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { graphColumns, repertoires, repMoves, reviewCards, reviewLog } from '../db/schema.js';

const scheduler = fsrs({ enable_fuzz: true });
const GRADES = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;

const reviewBody = z.object({
  fen: z.string().min(10).max(120),
  grade: z.enum(['again', 'hard', 'good', 'easy']),
});
const summaryQuery = z.object({
  /** Start of the user's day (ms), for the daily limit of new positions. */
  dayStart: z.coerce.number().int().nonnegative(),
  /** New lines to learn per day, all repertoires together (1000: no limit). */
  newPerDay: z.coerce.number().int().min(0).max(1000).default(5),
});

type CardRow = typeof reviewCards.$inferSelect;
const publicCard = (c: CardRow, now = new Date()) => ({
  fen: c.fen,
  /** Estimated probability (0-1) of finding the move now (FSRS retrievability). */
  recall: c.reps > 0 ? scheduler.retrievability(c.card as unknown as CardInput, now) : 0,
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
    if (!rep) return reply.code(404).send({ error: 'Répertoire introuvable' });
    const cards = await db.select().from(reviewCards).where(eq(reviewCards.repertoireId, rep.id));
    const now = new Date();
    return cards.map((c) => publicCard(c, now));
  });

  /** Records an answer and schedules the next review of the position. */
  app.post<{ Params: { id: string } }>('/api/repertoires/:id/review', async (req, reply) => {
    const [rep] = await db
      .select()
      .from(repertoires)
      .where(and(eq(repertoires.id, req.params.id), eq(repertoires.userId, req.user!.id)));
    if (!rep) return reply.code(404).send({ error: 'Répertoire introuvable' });
    const { fen, grade } = reviewBody.parse(req.body);

    const graph = new Repertoire(rep.color, await db.select().from(repMoves).where(eq(repMoves.repertoireId, rep.id)));
    if (!graph.isMyTurn(fen) || graph.movesAt(fen).length === 0) {
      return reply.code(400).send({ error: 'Pas une position à entraîner dans ce répertoire' });
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
    await db.insert(reviewLog).values({ repertoireId: rep.id, fen, grade, isNew: !existing, reviewedAt: now });
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

  /** Makes a learnt position due for review now (e.g. after a deviation in a game). */
  app.post<{ Params: { id: string } }>('/api/repertoires/:id/cards/due', async (req, reply) => {
    const [rep] = await db
      .select({ id: repertoires.id })
      .from(repertoires)
      .where(and(eq(repertoires.id, req.params.id), eq(repertoires.userId, req.user!.id)));
    if (!rep) return reply.code(404).send({ error: 'Répertoire introuvable' });
    const { fen } = z.object({ fen: z.string().min(10).max(120) }).parse(req.body);
    const [card] = await db
      .update(reviewCards)
      .set({ due: new Date() })
      .where(and(eq(reviewCards.repertoireId, rep.id), eq(reviewCards.fen, fen)))
      .returning();
    if (!card) return reply.code(404).send({ error: 'Cette position n’est pas encore apprise : entraînez-la d’abord' });
    return publicCard(card);
  });

  /** Answers of the last `days` days, all repertoires (for activity statistics). */
  app.get('/api/stats/history', async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) }).parse(req.query);
    const since = new Date(Date.now() - days * 86_400_000);
    return db
      .select({ repertoireId: reviewLog.repertoireId, grade: reviewLog.grade, isNew: reviewLog.isNew, reviewedAt: reviewLog.reviewedAt })
      .from(reviewLog)
      .innerJoin(repertoires, eq(reviewLog.repertoireId, repertoires.id))
      .where(and(eq(repertoires.userId, req.user!.id), gte(reviewLog.reviewedAt, since)))
      .orderBy(reviewLog.reviewedAt);
  });

  /** Per repertoire: positions due now, new positions available today, lines to go through, and total. */
  app.get('/api/training/summary', async (req) => {
    const { dayStart, newPerDay } = summaryQuery.parse(req.query);
    const reps = await db.select().from(repertoires).where(eq(repertoires.userId, req.user!.id));
    if (!reps.length) return [];
    const ids = reps.map((r) => r.id);
    const [moves, cards] = await Promise.all([
      db.select(graphColumns).from(repMoves).where(inArray(repMoves.repertoireId, ids)),
      db.select().from(reviewCards).where(inArray(reviewCards.repertoireId, ids)),
    ]);
    const now = Date.now();
    // New lines: one daily limit for all repertoires (lines learnt today anywhere count).
    const rows = reps.map((r) => {
      const graph = new Repertoire(r.color, moves.filter((m) => m.repertoireId === r.id));
      const list = trainingPositions(graph);
      const positions = new Set(list.map((p) => p.fen));
      const own = cards.filter((c) => c.repertoireId === r.id && positions.has(c.fen));
      const known = new Set(own.map((c) => c.fen));
      const today = new Set(own.filter((c) => c.createdAt.getTime() >= dayStart).map((c) => c.fen));
      const dueSet = new Set(own.filter((c) => c.due.getTime() <= now).map((c) => c.fen));
      return {
        r,
        total: positions.size,
        /** Lines of the repertoire: its distinct line ends. */
        totalLines: [...graph.reachable()].filter((f) => graph.movesAt(f).length === 0).length,
        due: dueSet.size,
        /** Lines formed by the due positions. */
        dueLines: lineStarts(list.filter((p) => dueSet.has(p.fen)), (f) => dueSet.has(f)).length,
        learntTodayLines: lineStarts(list.filter((p) => today.has(p.fen)), (f) => today.has(f)).length,
        /** Whole lines not learnt yet. */
        availableLines: groupLines(list.filter((p) => !known.has(p.fen))).length,
      };
    });
    const remaining = Math.max(0, newPerDay - rows.reduce((n, x) => n + x.learntTodayLines, 0));
    return rows.map(({ r, ...x }) => {
      // New lines this repertoire can take today (the daily limit is shared by all of them).
      const newLines = r.active ? Math.min(remaining, x.availableLines) : 0;
      return {
        repertoireId: r.id,
        active: r.active,
        ...x,
        /** Lines still to learn today, all repertoires together (same for every item). */
        remainingNewLines: remaining,
        newLines,
        /** Lines to go through today in this repertoire: to review + new. */
        lines: x.dueLines + newLines,
      };
    });
  });
}
