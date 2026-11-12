/** Which positions of a repertoire are trained, and the line leading to each. */
import { START_FEN } from './position.js';
import { totalGames, type ExplorerResponse } from './explorer.js';
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

/** Training positions in the part of the repertoire reachable from `root`. */
export function trainingPositionsFrom(rep: Repertoire, root: string): TrainingPosition[] {
  if (root === START_FEN) return trainingPositions(rep);
  const reach = rep.reachable(root);
  return trainingPositions(rep).filter((p) => reach.has(p.fen));
}

/**
 * Weight of each repertoire reply of the opponent: number of games in the explorer statistics.
 * Replies missing from the statistics still get a small weight (2% of the known games) so they
 * are played sometimes. Without statistics: main line 2, others 1.
 */
export function replyWeights(replies: RepMove[], stats: ExplorerResponse | null | undefined): number[] {
  const games = new Map((stats?.moves ?? []).map((m) => [m.uci, totalGames(m)]));
  const known = replies.map((m) => games.get(m.uci) ?? 0);
  const sum = known.reduce((a, b) => a + b, 0);
  if (sum === 0) return replies.map((m) => (m.isMain ? 2 : 1));
  const floor = Math.max(1, 0.02 * sum);
  return known.map((g) => (g > 0 ? g : floor));
}

/** Picks an opponent reply at random, weighted by `replyWeights`. */
export function chooseReply(
  replies: RepMove[],
  stats: ExplorerResponse | null | undefined,
  random: () => number = Math.random,
): RepMove | undefined {
  if (!replies.length) return undefined;
  const weights = replyWeights(replies, stats);
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < replies.length; i++) {
    r -= weights[i]!;
    if (r < 0) return replies[i];
  }
  return replies.at(-1);
}

/** Shortest line from the initial position to `fen` in the repertoire (main lines preferred). */
export function pathTo(rep: Repertoire, fen: string): RepMove[] | null {
  if (fen === START_FEN) return [];
  const seen = new Set<string>([START_FEN]);
  let frontier: { fen: string; path: RepMove[] }[] = [{ fen: START_FEN, path: [] }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const m of rep.movesAt(node.fen)) {
        if (seen.has(m.toFen)) continue;
        const path = [...node.path, m];
        if (m.toFen === fen) return path;
        seen.add(m.toFen);
        next.push({ fen: m.toFen, path });
      }
    }
    frontier = next;
  }
  return null;
}
