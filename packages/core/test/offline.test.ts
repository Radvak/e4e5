import { describe, expect, it } from 'vitest';
import { pgnToMoves, recallOf, Repertoire, scheduleReview, trainingPositions, trainingSummary, type FsrsCard } from '../src/index.js';

/** A card as it travels: JSON (dates as strings), like the server sends it and IndexedDB keeps it. */
const roundTrip = (card: FsrsCard): FsrsCard => JSON.parse(JSON.stringify(card)) as FsrsCard;

describe('scheduleReview (FSRS on the device and on the server)', () => {
  const t0 = new Date('2026-11-01T10:00:00Z');
  const t1 = new Date('2026-11-01T10:05:00Z');
  const t2 = new Date('2026-11-03T09:00:00Z');

  it('gives the same card for the same answer at the same time (the fuzz is seeded)', () => {
    const device = scheduleReview(scheduleReview(undefined, 'good', t0).card, 'good', t2);
    const server = scheduleReview(roundTrip(scheduleReview(undefined, 'good', t0).card), 'good', t2);
    expect(server.card).toEqual(device.card);
    expect(server.due.getTime()).toBe(device.due.getTime());
  });

  it('schedules a series of answers from cards read back from JSON', () => {
    let card: FsrsCard | undefined;
    for (const [grade, at] of [['good', t0], ['good', t1], ['good', t2]] as const) card = roundTrip(scheduleReview(card, grade, at).card);
    const after = scheduleReview(card, 'good', new Date('2026-11-10T09:00:00Z'));
    expect(after.reps).toBe(4);
    expect(after.interval).toBeGreaterThan(1);
  });

  it('a mistake brings the move back sooner than a right answer', () => {
    const learnt = roundTrip(scheduleReview(scheduleReview(undefined, 'good', t0).card, 'good', t2).card);
    const later = new Date('2026-11-08T09:00:00Z');
    expect(scheduleReview(learnt, 'again', later).due.getTime()).toBeLessThan(scheduleReview(learnt, 'good', later).due.getTime());
    expect(scheduleReview(learnt, 'again', later).lapses).toBe(1);
  });

  it('recall: 0 before any review, high right after one', () => {
    const next = scheduleReview(undefined, 'good', t0);
    expect(recallOf(next.card, 0, t0)).toBe(0);
    expect(recallOf(next.card, next.reps, t0)).toBeGreaterThan(0.9);
  });
});

describe('trainingSummary (on the device)', () => {
  const white = pgnToMoves('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 *').moves;
  const rep = { id: 'r1', color: 'white' as const, active: true, moves: white };
  const positions = trainingPositions(new Repertoire('white', white));
  const opts = { dayStart: 1_000, newPerDay: 5, depth: 0, now: 10_000 };

  it('counts new lines when nothing is learnt, within the daily limit', () => {
    const [s] = trainingSummary([rep], () => undefined, null, opts);
    expect(s).toMatchObject({ repertoireId: 'r1', positions: positions.length, due: 0, availableLines: 2, newLines: 2, lines: 2 });
    expect(trainingSummary([rep], () => undefined, null, { ...opts, newPerDay: 1 })[0]!.newLines).toBe(1);
  });

  it('counts the due positions once answered, and the lines learnt today', () => {
    const learnt = (due: number) => () => ({ due, createdAt: 5_000 });
    const due = trainingSummary([rep], learnt(1_000), null, opts)[0]!;
    expect(due.due).toBe(positions.length);
    expect(due.availableLines).toBe(0);
    const later = trainingSummary([rep], learnt(99_000), null, opts)[0]!;
    expect(later).toMatchObject({ due: 0, dueLines: 0 });
    expect(later.learntTodayLines).toBeGreaterThan(0);
  });

  it('an inactive repertoire takes no new lines', () => {
    expect(trainingSummary([{ ...rep, active: false }], () => undefined, null, opts)[0]!.newLines).toBe(0);
  });
});
