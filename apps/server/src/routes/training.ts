/**
 * Training: spaced-repetition reviews (FSRS) of my moves, in the positions where it is my turn.
 * A move card belongs to the user, not to a repertoire: a move learnt once is known everywhere.
 */
import { groupLines, keptPositions, lineStarts, positionReview, Repertoire, trainingPositions } from '@prepa-cahier/core';
import { and, eq, gte, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createEmptyCard, fsrs, Rating, type CardInput } from 'ts-fsrs';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { graphColumns, moveCards, repertoires, repMoves, reviewLog } from '../db/schema.js';
import { makeDue } from '../moveCards.js';
import { gapsQuery, gapsReport } from './gaps.js';

const scheduler = fsrs({ enable_fuzz: true });
const GRADES = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;

const reviewBody = z.object({
  fen: z.string().min(10).max(120),
  uci: z.string().min(4).max(5),
  grade: z.enum(['again', 'hard', 'good', 'easy']),
});
const summaryQuery = z.object({
  /** Start of the user's day (ms), for the daily limit of new positions. */
  dayStart: z.coerce.number().int().nonnegative(),
  /** New lines to learn per day, all repertoires together (1000: no limit). */
  newPerDay: z.coerce.number().int().min(0).max(1000).default(5),
  /**
   * Shortened lines: share (0.01-1) of each repertoire's positions kept, the most likely to come
   * up (see core keptPositions), with the statistics settings below. 1: every position.
   */
  keep: z.coerce.number().min(0.01).max(1).default(1),
  speeds: z.string().optional(),
  ratings: z.string().optional(),
  cutoff: z.string().optional(),
});

type CardRow = typeof moveCards.$inferSelect;
const publicCard = (c: CardRow, now = new Date()) => ({
  fen: c.fen,
  uci: c.uci,
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
    const { fen, uci, grade } = reviewBody.parse(req.body);

    const graph = new Repertoire(rep.color, await db.select().from(repMoves).where(eq(repMoves.repertoireId, rep.id)));
    if (!graph.isMyTurn(fen) || !graph.movesAt(fen).some((m) => m.uci === uci)) {
      return reply.code(400).send({ error: 'Pas un coup à entraîner dans ce répertoire' });
    }
    const key = and(eq(moveCards.userId, userId), eq(moveCards.fen, fen), eq(moveCards.uci, uci));
    const [existing] = await db.select().from(moveCards).where(key);
    const now = new Date();
    const { card } = scheduler.next((existing?.card as CardInput | undefined) ?? createEmptyCard(now), now, GRADES[grade]);
    const row = {
      userId,
      fen,
      uci,
      card: JSON.parse(JSON.stringify(card)) as Record<string, unknown>,
      due: card.due,
      reps: card.reps,
      lapses: card.lapses,
      lastReview: now,
    };
    await db.insert(reviewLog).values({ repertoireId: rep.id, fen, uci, grade, isNew: !existing, reviewedAt: now });
    const [saved] = await db
      .insert(moveCards)
      .values(row)
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

  /**
   * Per repertoire: positions due now (a move of mine there is due), new positions available
   * today (a move not learnt yet), lines to go through, and total.
   */
  app.get('/api/training/summary', async (req) => {
    const { dayStart, newPerDay, keep, speeds, ratings, cutoff } = summaryQuery.parse(req.query);
    const reps = await db.select().from(repertoires).where(eq(repertoires.userId, req.user!.id));
    if (!reps.length) return [];
    // Reach probabilities for shortened lines (the gap finder's, as the training page uses).
    const stats = keep < 1 && speeds && ratings ? gapsQuery.safeParse({ speeds, ratings, cutoff }) : null;
    // Statistics unavailable (error): whole lines, like the training page.
    const gaps =
      stats?.success && stats.data.speeds.length && stats.data.ratings.length
        ? await gapsReport(req.user!, stats.data, req.log).catch((e: unknown) => {
            req.log.warn({ err: e }, 'Shortened lines: statistics unavailable');
            return null;
          })
        : null;
    const ids = reps.map((r) => r.id);
    const [moves, cards] = await Promise.all([
      db.select(graphColumns).from(repMoves).where(inArray(repMoves.repertoireId, ids)),
      db.select().from(moveCards).where(eq(moveCards.userId, req.user!.id)),
    ]);
    const now = Date.now();
    const cardMap = new Map(cards.map((c) => [`${c.fen} ${c.uci}`, { due: c.due.getTime(), createdAt: c.createdAt.getTime() }]));
    // New lines: one daily limit for all repertoires (lines learnt today anywhere count). A line
    // learnt today that is in several repertoires (shared moves) counts once, in the first one.
    const countedToday = new Set<string>();
    const rows = reps.map((r) => {
      const graph = new Repertoire(r.color, moves.filter((m) => m.repertoireId === r.id));
      const reach = gaps?.[r.color]?.reach;
      const all = trainingPositions(graph);
      const kept = reach ? keptPositions(all, (f) => reach[f], keep) : null;
      const list = kept ? all.filter((p) => kept.has(p.fen)) : all;
      const state = new Map(list.map((p) => [p.fen, positionReview(graph.movesAt(p.fen), (uci) => cardMap.get(`${p.fen} ${uci}`), now)]));
      const fresh = list.filter((p) => state.get(p.fen)!.status === 'new');
      const today = new Set(list.filter((p) => (state.get(p.fen)!.learntAt ?? 0) >= dayStart).map((p) => p.fen));
      const dueSet = new Set(list.filter((p) => state.get(p.fen)!.status === 'due').map((p) => p.fen));
      return {
        r,
        total: list.length,
        /** Lines of the repertoire: its distinct line ends. */
        totalLines: [...graph.reachable()].filter((f) => graph.movesAt(f).length === 0).length,
        due: dueSet.size,
        /** Lines formed by the due positions. */
        dueLines: lineStarts(list.filter((p) => dueSet.has(p.fen)), (f) => dueSet.has(f)).length,
        learntTodayLines: lineStarts(list.filter((p) => today.has(p.fen)), (f) => today.has(f)).filter((p) => {
          if (countedToday.has(p.fen)) return false;
          countedToday.add(p.fen);
          return true;
        }).length,
        /** Whole lines not learnt yet. */
        availableLines: groupLines(fresh).length,
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
