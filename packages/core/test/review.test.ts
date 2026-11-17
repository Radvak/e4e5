import { describe, expect, it } from 'vitest';
import { keptPositions, positionReview, type RepMove } from '../src/index.js';

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

describe('keptPositions (shortened lines)', () => {
  // Line a → b → c (my positions, two plies apart), and a branch a → d.
  const m = (from: string, to: string): RepMove => ({ fromFen: from, toFen: to, uci: `${from}${to}`, san: to });
  const a = { fen: 'a', path: [] };
  const b = { fen: 'b', path: [m('a', 'a1'), m('a1', 'b')] };
  const c = { fen: 'c', path: [...b.path, m('b', 'b1'), m('b1', 'c')] };
  const d = { fen: 'd', path: [m('a', 'a2'), m('a2', 'd')] };
  const positions = [a, b, c, d];
  const reach: Record<string, number> = { a: 1, b: 0.6, c: 0.5, d: 0.4 };

  it('keeps everything at 100%', () => {
    expect([...keptPositions(positions, () => undefined, 1)]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the most likely share', () => {
    expect([...keptPositions(positions, (f) => reach[f], 0.5)].sort()).toEqual(['a', 'b']);
    expect([...keptPositions(positions, (f) => reach[f], 0.75)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('stops a line at its first position left out', () => {
    // c is likelier than b (move orders adding up) but comes after it on its line.
    const r = { ...reach, b: 0.1, c: 0.9 };
    expect([...keptPositions(positions, (f) => r[f as keyof typeof r], 0.75)].sort()).toEqual(['a', 'd']);
  });

  it('ranks unknown probabilities last, the shallowest first', () => {
    expect([...keptPositions(positions, (f) => (f === 'a' ? 1 : undefined), 0.75)].sort()).toEqual(['a', 'b', 'd']);
  });
});
