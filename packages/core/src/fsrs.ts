/**
 * Spaced-repetition scheduling (FSRS) of my moves, shared by the server and the browser: the app
 * schedules an answer at once on the device (offline too), and the server stores the same result.
 *
 * The fuzz added to the intervals is seeded by the review time and the card state, so the same
 * answer scheduled on the device and on the server (with the device's review time) gives the same
 * card.
 */
import { createEmptyCard, fsrs, Rating, type CardInput } from 'ts-fsrs';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export const GRADES = ['again', 'hard', 'good', 'easy'] as const satisfies readonly Grade[];

/** A ts-fsrs card as JSON (dates as ISO strings), as stored and sent over the network. */
export type FsrsCard = Record<string, unknown>;

const scheduler = fsrs({ enable_fuzz: true });
const RATINGS = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;

/** Next state of a card (`undefined`: a move answered for the first time) after an answer at `at`. */
export function scheduleReview(card: FsrsCard | undefined, grade: Grade, at: Date) {
  const next = scheduler.next(card ? (card as unknown as CardInput) : createEmptyCard(at), at, RATINGS[grade]).card;
  return {
    card: JSON.parse(JSON.stringify(next)) as FsrsCard,
    due: next.due,
    reps: next.reps,
    lapses: next.lapses,
    /** Interval in days (0 while learning). */
    interval: Number(next.scheduled_days ?? 0),
  };
}

/** Estimated probability (0-1) of finding the move at `at` (0 for a card never reviewed). */
export function recallOf(card: FsrsCard, reps: number, at: Date): number {
  return reps > 0 ? scheduler.retrievability(card as unknown as CardInput, at) : 0;
}
