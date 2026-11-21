import { describe, expect, it } from 'vitest';
import { cellOf, cellsOf, decodeMove, decodePositionStats, encodeMove, encodePositionStats, type CellCounts } from '../src/index.js';

describe('position statistics codec', () => {
  it('encodes moves on 15 bits', () => {
    for (const uci of ['e2e4', 'e1g1', 'a7a8q', 'h2h1n', 'g8f6']) expect(decodeMove(encodeMove(uci))).toBe(uci);
  });

  it('adds up the cells asked', () => {
    const blitz1600 = cellOf('blitz', 1600);
    const rapid1800 = cellOf('rapid', 1800);
    const bullet1600 = cellOf('bullet', 1600);
    const cells = (entries: [number, [number, number, number]][]): CellCounts => new Map(entries);
    const data = encodePositionStats({
      total: cells([[blitz1600, [100, 20, 90]], [rapid1800, [300, 50, 200]], [bullet1600, [1_000_000, 5, 7]]]),
      moves: [
        { move: encodeMove('f1d3'), cells: cells([[blitz1600, [10, 2, 9]], [rapid1800, [24, 0, 11]]]) },
        { move: encodeMove('h2h4'), cells: cells([[blitz1600, [60, 10, 50]], [bullet1600, [999_999, 5, 7]]]) },
      ],
    });
    const asked = cellsOf(['blitz', 'rapid'], [1600, 1800]);
    expect(decodePositionStats(data, asked)).toEqual({
      white: 400,
      draws: 70,
      black: 290,
      moves: [
        { uci: 'h2h4', white: 60, draws: 10, black: 50 },
        { uci: 'f1d3', white: 34, draws: 2, black: 20 },
      ],
    });
    // Large counts survive the varints; a move without games in the cells asked is left out.
    expect(decodePositionStats(data, cellsOf(['bullet'], [1600]))).toEqual({
      white: 1_000_000,
      draws: 5,
      black: 7,
      moves: [{ uci: 'h2h4', white: 999_999, draws: 5, black: 7 }],
    });
  });
});
