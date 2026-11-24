import { pgnToMoves } from '@e4e5/core';
import { describe, expect, it } from 'vitest';
import { planSync, type ExistingMove } from '../src/repertoireSync.js';

/** A repertoire as stored after an import (source "pgn"), with ids. */
const stored = (pgn: string, source = 'pgn', from = 1): ExistingMove[] =>
  pgnToMoves(pgn).moves.map((m, i) => ({ ...m, id: from + i, source, comment: m.comment ?? null }));

describe('sync of a repertoire from its source', () => {
  const before = stored('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 *');
  const san = (moves: { san: string }[]) => moves.map((m) => m.san).sort();

  it('adds the new moves, removes the imported ones that left the source, keeps the rest', () => {
    // The source drops 1... c5 2. Nf3 and adds 3. d4 as an alternative to 3. Bb5.
    const plan = planSync('white', before, '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. d4) *');
    expect(san(plan.add)).toEqual(['d4']);
    expect(san(plan.remove)).toEqual(['Nf3', 'c5']);
    expect(plan.add[0]!.isMain).toBe(false); // 3. Bb5 stays the main move
  });

  it("never removes moves added by hand, and keeps the user's comments and main moves", () => {
    const own = [...before, ...stored('1. e4 e5 2. Nf3 Nc6 3. Bc4 *', 'manual', 100).filter((m) => m.san === 'Bc4')];
    own.find((m) => m.san === 'Bb5')!.comment = 'my note';
    own.find((m) => m.san === 'Bc4')!.isMain = true;
    own.find((m) => m.san === 'Bb5')!.isMain = false;
    const plan = planSync('white', own, '1. e4 e5 2. Nf3 Nc6 3. Bb5 *');
    expect(plan.remove.map((m) => m.san)).not.toContain('Bc4');
    expect(plan.update.find((u) => u.id === own.find((m) => m.san === 'Bb5')!.id)).toBeUndefined();
  });

  it('takes the source comments, and a main move where none is left', () => {
    const plan = planSync('white', before, '1. e4 e5 (1... e6 2. d4) 2. Nf3 {Italian or Scotch} Nc6 3. Bb5 *');
    const nf3 = before.find((m) => m.san === 'Nf3' && m.fromFen.includes('4p3'))!;
    expect(plan.update).toContainEqual({ id: nf3.id, comment: 'Italian or Scotch' });
    expect(plan.add.find((m) => m.san === 'd4')!.isMain).toBe(true); // new position: its only move
  });

  it('hard mode: the repertoire becomes exactly the source', () => {
    const own = [...before, ...stored('1. e4 e5 2. Nf3 Nc6 3. Bc4 *', 'manual', 100).filter((m) => m.san === 'Bc4')];
    const bb5 = own.find((m) => m.san === 'Bb5')!;
    const bc4 = own.find((m) => m.san === 'Bc4')!;
    bb5.comment = 'my note';
    bb5.isMain = false;
    bc4.isMain = true;
    // The source: 3. d4 main, 3. Bb5 as an alternative, no 1... c5.
    const plan = planSync('white', own, '1. e4 e5 2. Nf3 Nc6 3. d4 (3. Bb5) *', 'hard');
    expect(san(plan.remove)).toEqual(['Bc4', 'Nf3', 'c5']); // hand-added Bc4 removed too
    expect(plan.add.map((m) => [m.san, m.isMain])).toEqual([['d4', true]]);
    expect(plan.update).toContainEqual({ id: bb5.id, comment: null });
    expect(plan.update.find((u) => u.id === bb5.id)?.isMain).toBeUndefined(); // already not main
    // Nothing else changes: running it again on the result is a no-op.
    const after = own.filter((m) => !plan.remove.includes(m)).map((m) => (m.id === bb5.id ? { ...m, comment: null } : m));
    const again = planSync('white', [...after, ...plan.add.map((m, i) => ({ ...m, id: 1000 + i, source: 'pgn', comment: null }))], '1. e4 e5 2. Nf3 Nc6 3. d4 (3. Bb5) *', 'hard');
    expect([again.add.length, again.remove.length, again.update.length]).toEqual([0, 0, 0]);
  });
});
