/**
 * Zobrist key of a position: a 64-bit number, the key of the position statistics built from the
 * Lichess game database (one row per position). XOR of the random numbers of what the position
 * holds (each piece on its square, castling rights, en passant file, white to move), with the
 * Polyglot numbers: two move orders reaching the same position get the same key.
 *
 * One difference with Polyglot: the en passant file counts only when the capture is legal
 * (Polyglot: when a pawn stands next to it, even pinned), as in fenKey, so that "the same
 * position" means the same thing everywhere in the app. Only rare positions differ.
 *
 * There is no way back from a key to its position, and none is needed: a key is always
 * computed from a known position.
 */
import type { Role } from 'chessops';
import type { Position } from 'chessops/chess';
import { positionFromFen } from './position.js';
import { POLYGLOT_KEYS } from './zobristKeys.js';

const ROLE_INDEX: Record<Role, number> = { pawn: 0, knight: 1, bishop: 2, rook: 3, queen: 4, king: 5 };
/** Castling rights, by the square of the rook: h1, a1, h8, a8. */
const CASTLING: [number, number][] = [
  [7, 768],
  [0, 769],
  [63, 770],
  [56, 771],
];

/** The key as two unsigned 32-bit halves (high, low): fast to compare and hash. */
export function zobristHalves(pos: Position): [number, number] {
  let hi = 0;
  let lo = 0;
  const xor = (index: number) => {
    hi ^= POLYGLOT_KEYS[2 * index]!;
    lo ^= POLYGLOT_KEYS[2 * index + 1]!;
  };
  for (const square of pos.board.occupied) {
    const piece = pos.board.get(square)!;
    xor(64 * (2 * ROLE_INDEX[piece.role] + (piece.color === 'white' ? 1 : 0)) + square);
  }
  for (const [rook, index] of CASTLING) if (pos.castles.castlingRights.has(rook)) xor(index);
  const ep = pos.toSetup().epSquare; // only when the capture is legal
  if (ep !== undefined) xor(772 + (ep & 7));
  if (pos.turn === 'white') xor(780);
  return [hi >>> 0, lo >>> 0];
}

/** The key as a signed 64-bit integer (the INTEGER of SQLite). */
export function zobrist(pos: Position): bigint {
  const [hi, lo] = zobristHalves(pos);
  return BigInt.asIntN(64, (BigInt(hi) << 32n) | BigInt(lo));
}

/** The key of a position key (fenKey) or any FEN. */
export const zobristOfFen = (fen: string): bigint => zobrist(positionFromFen(fen));
