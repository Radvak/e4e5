import { describe, expect, it } from 'vitest';
import { bestMoves, playUci, START_FEN, type ExplorerResponse } from '../src/index.js';

const after = (...ucis: string[]) => ucis.reduce((fen, u) => playUci(fen, u)!.toFen, START_FEN);

/** Explorer answer from [uci, san, white wins, draws, black wins]. */
const stats = (moves: [string, string, number, number, number][]): ExplorerResponse => ({
  white: moves.reduce((n, m) => n + m[2], 0),
  draws: moves.reduce((n, m) => n + m[3], 0),
  black: moves.reduce((n, m) => n + m[4], 0),
  moves: moves.map(([uci, san, white, draws, black]) => ({ uci, san, white, draws, black })),
});

describe('best moves', () => {
  it('with nothing explored, ranks by the next move score', () => {
    const table = new Map([[START_FEN, stats([['e2e4', 'e4', 500, 0, 500], ['d2d4', 'd4', 600, 0, 400]])]]);
    const r = bestMoves(START_FEN, (f) => table.get(f), { minReach: 2, prior: 0 });
    expect(r.moves.map((m) => m.san)).toEqual(['d4', 'e4']);
    expect(r.moves[0]!.score).toBeCloseTo(0.6);
    expect(r.missing).toEqual([]);
  });

  it('looks ahead: a move whose good follow-up wins more beats a better next-move win rate', () => {
    const table = new Map([
      // d4 scores better at once, e4 is 50%…
      [START_FEN, stats([['e2e4', 'e4', 500, 0, 500], ['d2d4', 'd4', 550, 0, 450]])],
      // …but after 1. e4 e5 White has a move scoring 70%, after 1. d4 d5 nothing beyond 55%.
      [after('e2e4'), stats([['e7e5', 'e5', 500, 0, 500]])],
      [after('e2e4', 'e7e5'), stats([['g1f3', 'Nf3', 280, 0, 120], ['f1c4', 'Bc4', 220, 0, 380]])],
      [after('d2d4'), stats([['d7d5', 'd5', 550, 0, 450]])],
      [after('d2d4', 'd7d5'), stats([['c2c4', 'c4', 550, 0, 450]])],
    ]);
    const r = bestMoves(START_FEN, (f) => table.get(f), { maxDepth: 2, prior: 0 });
    expect(r.moves[0]).toMatchObject({ san: 'e4', line: [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }] });
    expect(r.moves[0]!.score).toBeCloseTo(0.7);
    expect(r.moves[0]!.direct).toBeCloseTo(0.5);
    expect(r.moves[1]!.score).toBeCloseTo(0.55);
  });

  it('explains each move by the opponent replies, my answer and the score after each', () => {
    const table = new Map([
      [START_FEN, stats([['e2e4', 'e4', 500, 0, 500]])],
      // 1. e4: e5 in 75% of the games, c5 in 25%.
      [after('e2e4'), stats([['c7c5', 'c5', 100, 0, 150], ['e7e5', 'e5', 375, 0, 375]])],
      [after('e2e4', 'e7e5'), stats([['g1f3', 'Nf3', 280, 0, 120], ['f1c4', 'Bc4', 220, 0, 380]])],
      [after('e2e4', 'c7c5'), stats([['b1c3', 'Nc3', 120, 0, 130]])],
    ]);
    const r = bestMoves(START_FEN, (f) => table.get(f), { maxDepth: 2, prior: 0 });
    const [e5, c5] = r.moves[0]!.replies;
    expect(e5).toMatchObject({ san: 'e5', answer: { san: 'Nf3' } });
    expect(e5!.share).toBeCloseTo(0.75);
    expect(e5!.score).toBeCloseTo(0.7);
    expect(c5).toMatchObject({ san: 'c5', answer: { san: 'Nc3' } });
    expect(c5!.score).toBeCloseTo(0.48);
    expect(r.moves[0]!.score).toBeCloseTo(0.75 * 0.7 + 0.25 * 0.48);
    // Nothing explored: no replies.
    expect(bestMoves(START_FEN, (f) => table.get(f), { minReach: 2 }).moves[0]!.replies).toEqual([]);
  });

  it('finds a strong move two moves deep behind a worse first move (depth 3)', () => {
    const table = new Map([
      // 1. d4 scores 55% and stays at 55%; 1. e4 scores 45%…
      [START_FEN, stats([['d2d4', 'd4', 550, 0, 450], ['e2e4', 'e4', 450, 0, 550]])],
      [after('d2d4'), stats([['d7d5', 'd5', 550, 0, 450]])],
      [after('d2d4', 'd7d5'), stats([['c2c4', 'c4', 550, 0, 450]])],
      [after('d2d4', 'd7d5', 'c2c4'), stats([['e7e6', 'e6', 550, 0, 450]])],
      [after('d2d4', 'd7d5', 'c2c4', 'e7e6'), stats([['b1c3', 'Nc3', 550, 0, 450]])],
      [after('e2e4'), stats([['e7e5', 'e5', 450, 0, 550]])],
      [after('e2e4', 'e7e5'), stats([['g1f3', 'Nf3', 450, 0, 550]])],
      [after('e2e4', 'e7e5', 'g1f3'), stats([['b8c6', 'Nc6', 450, 0, 550]])],
      // …but on the third move White has a move scoring 80%, rarely played at that level.
      [after('e2e4', 'e7e5', 'g1f3', 'b8c6'), stats([['d2d3', 'd3', 400, 0, 600], ['f1b5', 'Bb5', 40, 0, 10]])],
    ]);
    const atDepth = (maxDepth: number) => bestMoves(START_FEN, (f) => table.get(f), { maxDepth, prior: 0 });
    expect(atDepth(2).moves[0]!.san).toBe('d4'); // not visible two moves deep
    const r = atDepth(3);
    expect(r.moves[0]).toMatchObject({ san: 'e4', direct: 0.45 });
    expect(r.moves[0]!.score).toBeCloseTo(0.8);
    expect(r.moves[0]!.line.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(r.moves[1]!.score).toBeCloseTo(0.55);
  });

  it('weights the opponent replies by frequency and plays from Black', () => {
    const root = after('e2e4');
    const table = new Map([
      [root, stats([['c7c5', 'c5', 500, 0, 500]])],
      // 1... c5: 2. Nf3 (75%) then Black scores 60% with d6; 2. c3 (25%) then 40% at best.
      [after('e2e4', 'c7c5'), stats([['g1f3', 'Nf3', 375, 0, 375], ['c2c3', 'c3', 125, 0, 125]])],
      [after('e2e4', 'c7c5', 'g1f3'), stats([['d7d6', 'd6', 200, 0, 300]])],
      [after('e2e4', 'c7c5', 'c2c3'), stats([['d7d5', 'd5', 300, 0, 200]])],
    ]);
    const r = bestMoves(root, (f) => table.get(f), { maxDepth: 2, prior: 0 });
    expect(r.moves[0]!.score).toBeCloseTo(0.75 * 0.6 + 0.25 * 0.4);
    expect(r.moves[0]!.line.map((m) => m.san)).toEqual(['c5', 'Nf3', 'd6']);
  });

  it('shrinks small samples and ignores moves with too few games', () => {
    const table = new Map([[START_FEN, stats([['e2e4', 'e4', 520, 0, 480], ['b2b3', 'b3', 40, 0, 10], ['g2g4', 'g4', 10, 0, 0]])]]);
    const r = bestMoves(START_FEN, (f) => table.get(f), { minReach: 2 });
    expect(r.moves.map((m) => m.san)).toEqual(['b3', 'e4']); // g4: 10 games
    expect(r.moves[0]!.direct).toBeCloseTo(0.8);
    expect(r.moves[0]!.score).toBeLessThan(0.7); // 50 games at 80% shrunk towards ~54%
  });

  it('reports the positions it needs, and scores them with the move statistics meanwhile', () => {
    const table = new Map([[START_FEN, stats([['e2e4', 'e4', 550, 0, 450]])]]);
    const r = bestMoves(START_FEN, (f) => table.get(f), { maxDepth: 2, prior: 0 });
    expect(r.moves[0]!.score).toBeCloseTo(0.55);
    expect(r.missing).toEqual([{ fen: after('e2e4'), reach: 1 }]);
  });
});

describe('best moves, restricted', () => {
  it('only looks at the given first moves, and gives each its depth', () => {
    const table = new Map([[START_FEN, stats([['e2e4', 'e4', 500, 0, 500], ['d2d4', 'd4', 600, 0, 400], ['c2c4', 'c4', 550, 0, 450]])]]);
    const r = bestMoves(START_FEN, (f) => table.get(f), { maxDepth: 2, prior: 0, only: ['e2e4', 'c2c4'] });
    expect(r.moves.map((m) => m.san)).toEqual(['c4', 'e4']);
    expect(r.moves.every((m) => m.minReach === 0.06)).toBe(true);
  });

  it('keeps the defaults for options given as undefined', () => {
    const table = new Map([[START_FEN, stats([['e2e4', 'e4', 500, 0, 500]])]]);
    expect(bestMoves(START_FEN, (f) => table.get(f), { minReach: 2, only: undefined }).moves).toHaveLength(1);
  });
});

describe('best moves, by probability', () => {
  /** A forced line for Black (one reply each time), then White's last move scores 80%. */
  const forced = new Map([
    [START_FEN, stats([['e2e4', 'e4', 450, 0, 550], ['d2d4', 'd4', 550, 0, 450]])],
    [after('d2d4'), stats([['d7d5', 'd5', 300, 0, 250], ['g8f6', 'Nf6', 250, 0, 200]])],
    [after('e2e4'), stats([['e7e5', 'e5', 450, 0, 550]])],
    [after('e2e4', 'e7e5'), stats([['g1f3', 'Nf3', 450, 0, 550]])],
    [after('e2e4', 'e7e5', 'g1f3'), stats([['b8c6', 'Nc6', 450, 0, 550]])],
    [after('e2e4', 'e7e5', 'g1f3', 'b8c6'), stats([['f1c4', 'Bc4', 450, 0, 550]])],
    [after('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'), stats([['f8c5', 'Bc5', 450, 0, 550]])],
    [after('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'), stats([['c2c3', 'c3', 400, 0, 600], ['b1c3', 'Nc3', 80, 0, 20]])],
  ]);

  it('follows a forced line as deep as it stays likely, past three moves', () => {
    const r = bestMoves(START_FEN, (f) => forced.get(f), { minReach: 0.5, prior: 0 });
    expect(r.moves[0]!.san).toBe('e4');
    expect(r.moves[0]!.score).toBeCloseTo(0.8);
    expect(r.moves[0]!.line.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'Nc3']);
  });

  it('does not explore replies under the threshold', () => {
    // 1. d4: d5 (55%) and Nf6 (45%); at 50%, only the positions after d5 are wanted.
    const r = bestMoves(START_FEN, (f) => forced.get(f), { minReach: 0.5, prior: 0 });
    const wanted = r.missing.map((m) => m.fen);
    expect(wanted).toContain(after('d2d4', 'd7d5'));
    expect(wanted).not.toContain(after('d2d4', 'g8f6'));
  });

  it('splits the probability on the opponent replies, not on my candidate moves', () => {
    const r = bestMoves(START_FEN, (f) => forced.get(f), { minReach: 0.2, prior: 0 });
    // Both replies to 1. d4 are wanted, each with its share of the games.
    expect(r.missing.find((m) => m.fen === after('d2d4', 'd7d5'))!.reach).toBeCloseTo(0.55);
    expect(r.missing.find((m) => m.fen === after('d2d4', 'g8f6'))!.reach).toBeCloseTo(0.45);
  });
});
