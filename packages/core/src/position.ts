/** Positions and moves: thin helpers over chessops. */
import { isNormal, makeSquare, makeUci, parseUci, squareFile, squareRank, type Move } from 'chessops';
import { Chess, normalizeMove, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';

export type Color = 'white' | 'black';

/**
 * Key of a position: FEN without halfmove/fullmove counters, so two move orders reaching
 * the same position (a transposition) share the same key.
 */
export function fenKey(pos: Position): string {
  return makeFen(pos.toSetup(), { epd: true });
}

export const START_FEN = fenKey(Chess.default());

export function positionFromFen(fen: string): Position {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

/** Side to move of a position key. */
export function turnOf(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/**
 * UCI in standard notation. chessops encodes castling as "king takes own rook" (e1h1);
 * Lichess, chessground and humans expect e1g1.
 */
export function standardUci(pos: Position, move: Move): string {
  if (isNormal(move)) {
    const piece = pos.board.get(move.from);
    const target = pos.board.get(move.to);
    if (piece?.role === 'king' && target?.role === 'rook' && target.color === piece.color) {
      const file = squareFile(move.to) > squareFile(move.from) ? 6 : 2;
      return makeSquare(move.from) + makeSquare(squareRank(move.from) * 8 + file);
    }
  }
  return makeUci(move);
}

export interface PlayedMove {
  san: string;
  uci: string;
  fromFen: string;
  toFen: string;
}

function play(pos: Position, move: Move): PlayedMove {
  const fromFen = fenKey(pos);
  const san = makeSan(pos, move);
  const uci = standardUci(pos, move);
  pos.play(move);
  return { san, uci, fromFen, toFen: fenKey(pos) };
}

/** Plays a UCI move (e1g1 or e1h1 castling accepted) on `pos` in place; null if illegal. */
export function playUciOn(pos: Position, uci: string): PlayedMove | null {
  const parsed = parseUci(uci);
  if (!parsed) return null;
  const move = normalizeMove(pos, parsed);
  if (!pos.isLegal(move)) return null;
  return play(pos, move);
}

/** Plays a SAN move on `pos` in place; null if illegal or unparsable. */
export function playSanOn(pos: Position, san: string): PlayedMove | null {
  const move = parseSan(pos, san);
  if (!move) return null;
  return play(pos, move);
}

/** Plays a UCI move from a position key, without mutating anything. */
export function playUci(fen: string, uci: string): PlayedMove | null {
  return playUciOn(positionFromFen(fen), uci);
}
