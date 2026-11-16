import { describe, expect, it } from 'vitest';
import { positionReview, type RepMove } from '../src/index.js';

const move = (uci: string): RepMove => ({ fromFen: 'f', toFen: `f-${uci}`, uci, san: uci });

describe('positionReview (move cards)', () => {
  const moves = [move('e2e4'), move('d2d4')];
  const now = 1000;

  it('is new with every move pending when nothing is learnt', () => {
    const r = positionReview(moves, () => undefined, now);
    expect(r.status).toBe('new');
    expect(r.pending.map((m) => m.uci)).toEqual(['e2e4', 'd2d4']);
    expect(r.learntAt).toBeNull();
  });

  it('asks only the alternative not learnt yet', () => {
    const r = positionReview(moves, (uci) => (uci === 'e2e4' ? { due: 5000, createdAt: 10 } : undefined), now);
    expect(r.status).toBe('new');
    expect(r.pending.map((m) => m.uci)).toEqual(['d2d4']);
    expect(r.learntAt).toBe(10);
  });

  it('is due before new, with the due moves only', () => {
    const r = positionReview(moves, (uci) => (uci === 'e2e4' ? { due: 500, createdAt: 10 } : undefined), now);
    expect(r).toMatchObject({ status: 'due', at: 500 });
    expect(r.pending.map((m) => m.uci)).toEqual(['e2e4']);
  });

  it('is learnt when every move is, until the earliest review', () => {
    const r = positionReview(moves, (uci) => ({ due: uci === 'e2e4' ? 3000 : 2000, createdAt: uci === 'e2e4' ? 10 : 20 }), now);
    expect(r).toMatchObject({ status: 'learnt', at: 2000, pending: [], learntAt: 20 });
  });
});
