/** Which positions of a repertoire are trained, and the line leading to each. */
import { START_FEN } from './position.js';
import type { Repertoire, RepMove } from './repertoire.js';

export interface TrainingPosition {
  /** Position where it is my turn and the repertoire has at least one move. */
  fen: string;
  /** Moves from the initial position to `fen` (main lines preferred). */
  path: RepMove[];
}

/**
 * Every position to train, in learning order: depth-first along the repertoire, main line
 * first, so new positions are learnt line by line. A position reached by several move orders
 * appears once, with the first line found.
 */
export function trainingPositions(rep: Repertoire): TrainingPosition[] {
  const out: TrainingPosition[] = [];
  const seen = new Set<string>([START_FEN]);
  const stack: { fen: string; path: RepMove[] }[] = [{ fen: START_FEN, path: [] }];
  while (stack.length) {
    const { fen, path } = stack.pop()!;
    const moves = rep.movesAt(fen); // main line first
    if (moves.length && rep.isMyTurn(fen)) out.push({ fen, path });
    // Push in reverse so the main line is explored first.
    for (const m of [...moves].reverse()) {
      if (seen.has(m.toFen)) continue;
      seen.add(m.toFen);
      stack.push({ fen: m.toFen, path: [...path, m] });
    }
  }
  return out;
}
