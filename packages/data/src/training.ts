/**
 * Training: spaced-repetition reviews (FSRS) of my moves, in the positions where it is my turn.
 * A move card belongs to the user, not to a repertoire: a move learnt once is known everywhere.
 * Shared by the server (routes/training.ts, gamesync.ts) and the app running without a server.
 *
 * The app schedules each answer on the device at once (core fsrs.ts, offline too) and records it
 * here, possibly later: with its own id (an answer recorded twice counts once) and the time it was
 * given, so the same card is computed again.
 */
import { recallOf, Repertoire, scheduleReview, type Grade } from '@e4e5/core';
import { and, eq, inArray } from 'drizzle-orm';
import { DataError, type Db } from './db.js';
import { ownChapter } from './repertoires.js';
import { moveCards, repMoves, reviewLog } from './schema.js';

type CardRow = typeof moveCards.$inferSelect;

/** A move card as the app sees it. */
export function publicCard(c: CardRow, now = new Date()) {
  return {
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
  };
}

/** Review state of every learnt move of the user. */
export async function listCards(db: Db, userId: string) {
  const cards = await db.select().from(moveCards).where(eq(moveCards.userId, userId));
  const now = new Date();
  return cards.map((c) => publicCard(c, now));
}

export interface Answer {
  fen: string;
  uci: string;
  grade: Grade;
  /** Id given by the device to this answer (recorded again after a lost connection: counted once). */
  id?: string;
  /** When the answer was given (ms), for answers recorded later (offline). Default: now. */
  reviewedAt?: number;
}

/** Records an answer (the move asked in a position of the chapter) and schedules its next review. */
export async function recordAnswer(db: Db, userId: string, chapterId: string, answer: Answer) {
  const rep = await ownChapter(db, userId, chapterId);
  const { fen, uci, grade, id, reviewedAt } = answer;
  const graph = new Repertoire(rep.color, await db.select().from(repMoves).where(eq(repMoves.chapterId, rep.id)));
  if (!graph.isMyTurn(fen) || !graph.movesAt(fen).some((m) => m.uci === uci)) {
    throw new DataError(400, 'Pas un coup à entraîner dans ce chapitre');
  }
  const key = and(eq(moveCards.userId, userId), eq(moveCards.fen, fen), eq(moveCards.uci, uci));
  const [existing] = await db.select().from(moveCards).where(key);
  const now = new Date();
  // The time of the answer, not before the card's last review (answers are recorded in order) nor
  // in the future (device clock ahead).
  const at = new Date(Math.min(now.getTime(), Math.max(reviewedAt ?? now.getTime(), existing?.lastReview?.getTime() ?? 0)));
  // Recorded once per id: the same answer recorded again leaves the card as it is.
  const logged = await db
    .insert(reviewLog)
    .values({ chapterId: rep.id, fen, uci, grade, isNew: !existing, reviewedAt: at, clientId: id ?? null })
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
}

/**
 * Makes my moves of a chapter in a position due for review now (e.g. after a deviation in a
 * game). Only the learnt ones: new moves are learnt through the normal review. Returns how many.
 */
export async function makeDue(db: Db, userId: string, chapterId: string, fen: string): Promise<number> {
  const moves = await db
    .select({ uci: repMoves.uci })
    .from(repMoves)
    .where(and(eq(repMoves.chapterId, chapterId), eq(repMoves.fromFen, fen)));
  if (!moves.length) return 0;
  const updated = await db
    .update(moveCards)
    .set({ due: new Date() })
    .where(and(eq(moveCards.userId, userId), eq(moveCards.fen, fen), inArray(moveCards.uci, moves.map((m) => m.uci))))
    .returning({ uci: moveCards.uci });
  return updated.length;
}

/** makeDue for a chapter of the user, as asked from the app: 404 when nothing was learnt there. */
export async function reviewNow(db: Db, userId: string, chapterId: string, fen: string): Promise<{ ok: true }> {
  await ownChapter(db, userId, chapterId);
  if (!(await makeDue(db, userId, chapterId, fen))) {
    throw new DataError(404, 'Cette position n’est pas encore apprise : entraînez-la d’abord');
  }
  return { ok: true };
}
