import { describe, expect, it } from 'vitest';
import { playUci, START_FEN, zobristOfFen } from '../src/index.js';

/** Key after playing `ucis` from the initial position, as 16 hex digits (unsigned). */
const keyAfter = (ucis: string[]) => {
  let fen = START_FEN;
  for (const uci of ucis) fen = playUci(fen, uci)!.toFen;
  return BigInt.asUintN(64, zobristOfFen(fen)).toString(16).padStart(16, '0');
};

describe('zobrist', () => {
  // The test positions of the Polyglot book format specification.
  it('matches the Polyglot keys', () => {
    expect(keyAfter([])).toBe('463b96181691fc9c');
    expect(keyAfter(['e2e4'])).toBe('823c9b50fd114196');
    expect(keyAfter(['e2e4', 'd7d5'])).toBe('0756b94461c50fb0');
    expect(keyAfter(['e2e4', 'd7d5', 'e4e5'])).toBe('662fafb965db29d4');
    expect(keyAfter(['e2e4', 'd7d5', 'e4e5', 'f7f5'])).toBe('22a48b5a8e47ff78'); // en passant f6
    expect(keyAfter(['e2e4', 'd7d5', 'e4e5', 'f7f5', 'e1e2'])).toBe('652a607ca3f242c1');
    expect(keyAfter(['e2e4', 'd7d5', 'e4e5', 'f7f5', 'e1e2', 'e8f7'])).toBe('00fdd303c946bdd9');
    expect(keyAfter(['a2a4', 'b7b5', 'h2h4', 'b5b4', 'c2c4'])).toBe('3c8123ea7b067637');
    expect(keyAfter(['a2a4', 'b7b5', 'h2h4', 'b5b4', 'c2c4', 'b4c3', 'a1a3'])).toBe('5c3f9b829b279560');
  });

  it('gives transpositions the same key', () => {
    expect(keyAfter(['g1f3', 'd7d5', 'd2d4'])).toBe(keyAfter(['d2d4', 'd7d5', 'g1f3']));
    expect(keyAfter(['g1f3', 'd7d5'])).not.toBe(keyAfter(['d2d4', 'd7d5']));
  });
});
