/**
 * Move suggestions for my side: the moves that maximise my expected score at my level, looking
 * several moves ahead rather than at the next move's win rate alone.
 *
 * Expectimax on the explorer statistics (players of my level):
 * - my turn: I play the move with the best expected score (the line I would prepare);
 * - opponent's turn: the average over the replies, weighted by how often each is played;
 * - at the end of the search (rare position, statistics not known yet): the score of the last
 *   move in the explorer, (wins + draws / 2) / games, from my side.
 *
 * The search goes as deep as the lines are likely, not to a fixed depth: a position is explored
 * while it is reached in `minReach` of the games or more. Its probability is the product of the
 * opponent's reply frequencies on the way; my moves do not divide it, as each of my candidate
 * moves is a branch of its own ("if I play this move"), compared with the others afterwards.
 * A forced line is followed far, a reply played in 3% of the games is not explored at all.
 * As my candidate moves multiply the branches without lowering the probability, there are few
 * of them past the start (`candidates`), and lines stop at `maxDepth` moves of mine.
 *
 * Taking the best of several noisy win rates favours moves with few games (12 games, 80%), so
 * every score is shrunk towards the score of the position it comes from: `prior` pseudo-games
 * at that score are added to the move's games. Moves with fewer than `minGames` games are not
 * candidates for my side.
 *
 * On the opponent's turn (`color` given, not the side to move), each of its likely moves is
 * scored by the same search started one move later, from the position after it.
 */
import { totalGames, type ExplorerMove, type ExplorerResponse } from './explorer.js';
import { playUci, turnOf, type Color } from './position.js';

export interface BestMovesOptions {
  /**
   * Positions reached in fewer games than this share (from the start, if I play the line) are
   * not explored. Over 1: nothing is, the moves are ranked on their own win rate.
   */
  minReach?: number;
  /** Safety: lines stop after this many moves of mine. */
  maxDepth?: number;
  /** My candidate moves at the start (most played first). */
  rootCandidates?: number;
  /** My candidate moves further in the line. */
  candidates?: number;
  /** A move of mine played in fewer games is not a candidate. */
  minGames?: number;
  /** Pseudo-games at the parent's score added to each score (shrinkage). */
  prior?: number;
  /** Only these of my moves at the start (UCI), e.g. the best ones at a smaller depth. */
  only?: string[];
  /** Opponent replies listed under each suggested move. */
  maxReplies?: number;
  /**
   * My side (default: the side to move). On the opponent's turn, the moves ranked are the
   * opponent's possible moves (played in `minGames` games or more, `opponentMoves` most played
   * at most): each is followed by the search from the position after it, as if it started there
   * (probability 1), so its score is my expected score with my best answer.
   */
  color?: Color;
  /** On the opponent's turn: its moves analysed (most played first). */
  opponentMoves?: number;
}

export interface SuggestedMove {
  uci: string;
  san: string;
  /** Games of the move in the position. */
  games: number;
  /** Its score in the explorer, from my side (wins + draws / 2). */
  direct: number;
  /** Expected score if I go on with the suggested moves, from my side. */
  score: number;
  /** `minReach` of the search that scored it. */
  minReach: number;
  /**
   * The move, then the expected line: the most played reply, my best move, … (an opponent's
   * move: then my best answer, the most played reply, …).
   */
  line: { uci: string; san: string }[];
  /**
   * Why it scores so: the opponent's replies to it (most played first, `maxReplies` at most),
   * each with my best answer and the expected score after it. Empty when nothing is explored.
   * For an opponent's move: the replies to my best answer (`line[1]`).
   */
  replies: SuggestedReply[];
}

export interface SuggestedReply {
  uci: string;
  san: string;
  /** Share of the games where the opponent plays it. */
  share: number;
  /** My best answer (none: the line is not explored further). */
  answer?: { uci: string; san: string };
  /** Expected score after the reply, from my side. */
  score: number;
}

export interface BestMovesReport {
  /** My candidate moves, best expected score first. */
  moves: SuggestedMove[];
  /** Positions the search wanted without statistics, most reached first: fetch them, run again. */
  missing: { fen: string; reach: number }[];
}

type Line = { uci: string; san: string }[];
interface Value {
  score: number;
  line: Line;
  /** On the opponent's turn: the replies, most played first. */
  replies?: SuggestedReply[];
}

const DEFAULTS: Required<BestMovesOptions> = {
  minReach: 0.06,
  maxDepth: 6,
  rootCandidates: 5,
  candidates: 2,
  minGames: 30,
  prior: 50,
  only: [],
  maxReplies: 3,
  color: 'white', // replaced by the side to move when not given
  opponentMoves: 10,
};

/** Score of results from `color`'s side, shrunk towards `towards` with `prior` pseudo-games. */
function scoreOf(r: { white: number; draws: number; black: number }, color: Color, towards: number, prior: number): number {
  const n = totalGames(r);
  const mine = color === 'white' ? r.white : r.black;
  return (mine + r.draws / 2 + prior * towards) / (n + prior);
}

/**
 * `statsAt`: the statistics of a position; undefined: not known yet (listed in `missing`); null:
 * known to be too rare to have any (the line ends there, nothing to fetch).
 */
export function bestMoves(
  root: string,
  statsAt: (fen: string) => ExplorerResponse | null | undefined,
  options: BestMovesOptions = {},
): BestMovesReport {
  // Options given as undefined keep their default.
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) } as Required<BestMovesOptions>;
  const color = options.color ?? turnOf(root);
  const missing = new Map<string, number>();
  const need = (fen: string, reach: number) => missing.set(fen, Math.max(missing.get(fen) ?? 0, reach));

  /** My candidate moves in a position: played often enough, most played first. */
  const candidatesOf = (stats: ExplorerResponse, max: number) =>
    stats.moves
      .filter((m) => totalGames(m) >= o.minGames)
      .sort((a, b) => totalGames(b) - totalGames(a))
      .slice(0, max);

  /** Value of my move `m` from `fen`: its own score, or deeper when the line is likely enough. */
  const myMove = (fen: string, m: ExplorerMove, base: number, reach: number, depthLeft: number): Value => {
    const leaf = scoreOf(m, color, base, o.prior);
    const self = { uci: m.uci, san: m.san };
    const next = depthLeft > 1 && reach >= o.minReach ? playUci(fen, m.uci) : null;
    const deeper = next ? opponentTurn(next.toFen, leaf, reach, depthLeft - 1) : null;
    return deeper ? { score: deeper.score, line: [self, ...deeper.line], replies: deeper.replies } : { score: leaf, line: [self] };
  };

  /** My turn: my best move (null: statistics not known, the caller keeps its own score). */
  const myTurn = (fen: string, base: number, reach: number, depthLeft: number, max = o.candidates): Value | null => {
    const stats = statsAt(fen);
    if (stats === undefined) need(fen, reach);
    if (!stats) return null;
    const own = totalGames(stats) ? scoreOf(stats, color, base, o.prior) : base;
    let best: Value | null = null;
    for (const m of candidatesOf(stats, max)) {
      const v = myMove(fen, m, own, reach, depthLeft);
      if (!best || v.score > best.score) best = v;
    }
    return best;
  };

  /** Opponent's turn: the replies weighted by how often they are played. */
  const opponentTurn = (fen: string, base: number, reach: number, depthLeft: number): Value | null => {
    const stats = statsAt(fen);
    if (stats === undefined) need(fen, reach);
    if (!stats) return null;
    const total = totalGames(stats);
    if (!total) return null;
    let score = 0;
    let seen = 0;
    let likely: { share: number; line: Line } | null = null;
    const replies: SuggestedReply[] = [];
    for (const r of stats.moves) {
      const share = totalGames(r) / total;
      seen += share;
      const leaf = scoreOf(r, color, base, o.prior);
      const next = reach * share >= o.minReach ? playUci(fen, r.uci) : null;
      const deeper = next ? myTurn(next.toFen, leaf, reach * share, depthLeft) : null;
      score += share * (deeper?.score ?? leaf);
      replies.push({ uci: r.uci, san: r.san, share, score: deeper?.score ?? leaf, ...(deeper?.line[0] ? { answer: deeper.line[0] } : {}) });
      if (!likely || share > likely.share) likely = { share, line: [{ uci: r.uci, san: r.san }, ...(deeper?.line ?? [])] };
    }
    // Replies too rare to be listed by the explorer: the position's own score.
    score += Math.max(0, 1 - seen) * base;
    replies.sort((a, b) => b.share - a.share);
    return { score, line: likely?.line ?? [], replies };
  };

  const stats = statsAt(root);
  if (!stats) return { moves: [], missing: stats === undefined ? [{ fen: root, reach: 1 }] : [] };
  const own = scoreOf(stats, color, 0.5, o.prior);
  const mine = turnOf(root) === color;
  const roots = o.only.length
    ? stats.moves.filter((m) => o.only.includes(m.uci))
    : candidatesOf(stats, mine ? o.rootCandidates : o.opponentMoves);
  /**
   * The opponent's move `m`: the search starts after it, at probability 1, exactly as from a root
   * of mine (my `rootCandidates` answers, then my best moves all along the likely lines; the
   * position's score shrunk towards 1/2 as at a root), so its score is the best one shown there.
   */
  const opponentMove = (m: ExplorerMove): Value => {
    const leaf = scoreOf(m, color, own, o.prior);
    const self = { uci: m.uci, san: m.san };
    const next = o.minReach <= 1 ? playUci(root, m.uci) : null;
    const deeper = next ? myTurn(next.toFen, 0.5, 1, o.maxDepth, o.rootCandidates) : null;
    return deeper ? { score: deeper.score, line: [self, ...deeper.line], replies: deeper.replies } : { score: leaf, line: [self] };
  };
  const moves = roots.map((m) => {
    const v = mine ? myMove(root, m, own, 1, o.maxDepth) : opponentMove(m);
    return {
      uci: m.uci,
      san: m.san,
      games: totalGames(m),
      direct: scoreOf(m, color, 0, 0),
      score: v.score,
      minReach: o.minReach,
      line: v.line,
      replies: (v.replies ?? []).slice(0, o.maxReplies),
    };
  });
  return {
    moves: moves.sort((a, b) => b.score - a.score),
    missing: [...missing].map(([fen, reach]) => ({ fen, reach })).sort((a, b) => b.reach - a.reach),
  };
}
