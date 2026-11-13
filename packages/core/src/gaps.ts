/**
 * Gap finder: how likely is each position of a repertoire to be reached in a real game, how
 * long games stay in the preparation, and which popular opponent moves are not prepared?
 *
 * Starting from the initial position (probability 1):
 * - opponent's turn: each move played in the explorer statistics carries its share of the
 *   games. Repertoire moves are followed; a move that transposes back into the repertoire is
 *   followed too; any other move is a hole.
 * - my turn: the probability is split equally between my prepared moves (I play one of them),
 *   so the total stays at 100%. No prepared move at all is a hole too ("no answer").
 *
 * Every game ends its preparation somewhere: an unprepared opponent move, the end of a line, a
 * position without statistics, or a position too rare to explore (under `cutoff`). The average
 * of these depths, weighted by probability, is the expected preparation depth. Positions under
 * the cutoff count with the depth reached so far, so a smaller cutoff is more exact.
 */
import { totalGames, type ExplorerResponse } from './explorer.js';
import { playUci, START_FEN } from './position.js';
import type { Repertoire, RepMove } from './repertoire.js';

export interface Gap {
  /** missing-reply: a popular opponent move is not prepared. no-answer: my turn, nothing prepared. */
  kind: 'missing-reply' | 'no-answer';
  /** Position where the gap is (before the opponent move, for missing-reply). */
  fen: string;
  /** The opponent move that is not prepared (missing-reply only). */
  move?: { uci: string; san: string };
  /** Probability of meeting this gap in a game (summed over the move orders reaching it). */
  prob: number;
  /** A line from the root to `fen` (the most likely one found). */
  path: RepMove[];
}

export interface GapReport {
  /** Gaps of probability `cutoff` or more, most likely first. */
  gaps: Gap[];
  /**
   * Expected number of plies (half-moves, counted from the initial position) played while the
   * game is still in the preparation. A lower bound when statistics are missing.
   */
  depth: number;
  /** Share of games that leave the preparation through a hole (at any depth). */
  lost: number;
  /** Share of games reaching the end of a prepared line (opponent to move, nothing more). */
  ends: number;
  /** Share of games reaching a position whose statistics are not known yet. */
  unknown: number;
  /** Share of games reaching positions too rare to explore (counted at the depth reached). */
  belowCutoff: number;
  /** Probability of reaching each explored position. */
  reached: Map<string, number>;
  /** Opponent positions explored without statistics, most likely first: fetch them, run again. */
  missingStats: { fen: string; prob: number }[];
  /** Opponent positions explored with statistics. */
  usedStats: string[];
  /** The node budget was hit (huge or cyclic repertoire): figures are partial. */
  truncated: boolean;
}

export interface GapOptions {
  /** Positions reached with a smaller probability are not explored. Default 1%. */
  cutoff?: number;
  root?: string;
  /** Plies played before `root` (for the depth). */
  rootPly?: number;
  /** Safety budget of visited positions. */
  maxNodes?: number;
  /** Called wherever the preparation of some games ends (see `PrepEnd`). */
  onEnd?: (end: PrepEnd) => void;
}

/** Where the preparation of a share of the games ends. */
export interface PrepEnd {
  kind: 'hole' | 'line-end' | 'no-stats' | 'too-rare';
  /** Position where it ends (before the unprepared move, for a hole). */
  fen: string;
  path: RepMove[];
  prob: number;
  /** Plies played in the preparation. */
  ply: number;
}

export function findGaps(
  rep: Repertoire,
  statsAt: (fen: string) => ExplorerResponse | null | undefined,
  { cutoff = 0.01, root = START_FEN, rootPly = 0, maxNodes = 200_000, onEnd }: GapOptions = {},
): GapReport {
  const gaps = new Map<string, Gap>();
  const missing = new Map<string, number>();
  const used = new Set<string>();
  const reached = new Map<string, number>();
  let lost = 0;
  let unknown = 0;
  let ends = 0;
  let belowCutoff = 0;
  let plies = 0;
  let nodes = 0;
  let truncated = false;

  const addGap = (g: Gap) => {
    const key = `${g.kind}|${g.fen}|${g.move?.uci ?? ''}`;
    const known = gaps.get(key);
    if (!known) return void gaps.set(key, g);
    if (g.prob > known.prob) known.path = g.path;
    known.prob += g.prob;
  };

  const onPath = new Set<string>();
  const visit = (fen: string, p: number, path: RepMove[]) => {
    const ply = rootPly + path.length;
    /** The preparation of these games ends here. */
    const stop = (share: number, kind: PrepEnd['kind']) => {
      plies += share * ply;
      if (share > 0) onEnd?.({ kind, fen, path, prob: share, ply });
    };
    if (p < cutoff || onPath.has(fen) || ++nodes > maxNodes) {
      if (nodes > maxNodes) truncated = true;
      belowCutoff += p;
      return stop(p, 'too-rare');
    }
    reached.set(fen, (reached.get(fen) ?? 0) + p);
    onPath.add(fen);
    const moves = rep.movesAt(fen);
    if (rep.isMyTurn(fen)) {
      if (!moves.length) {
        lost += p;
        stop(p, 'hole');
        addGap({ kind: 'no-answer', fen, prob: p, path });
      }
      for (const m of moves) visit(m.toFen, p / moves.length, [...path, m]);
    } else if (!moves.length) {
      ends += p;
      stop(p, 'line-end');
    } else {
      const stats = statsAt(fen);
      const total = stats ? totalGames(stats) : 0;
      if (!stats || !total) {
        unknown += p;
        stop(p, 'no-stats');
        if (!stats) missing.set(fen, (missing.get(fen) ?? 0) + p);
      } else {
        used.add(fen);
        let seen = 0;
        for (const em of stats.moves) {
          const q = (p * totalGames(em)) / total;
          seen += q;
          const own = moves.find((m) => m.uci === em.uci);
          if (own) {
            visit(own.toFen, q, [...path, own]);
            continue;
          }
          const played = playUci(fen, em.uci);
          if (played && rep.movesAt(played.toFen).length) {
            visit(played.toFen, q, [...path, played]); // transposes back into the repertoire
            continue;
          }
          lost += q;
          stop(q, 'hole');
          if (q >= cutoff) addGap({ kind: 'missing-reply', fen, move: { uci: em.uci, san: em.san }, prob: q, path });
        }
        // Rare moves beyond the ones listed by the explorer: unprepared, too small to list.
        const rest = Math.max(0, p - seen);
        lost += rest;
        stop(rest, 'hole');
      }
    }
    onPath.delete(fen);
  };
  visit(root, 1, []);

  return {
    gaps: [...gaps.values()].sort((a, b) => b.prob - a.prob),
    depth: plies,
    lost,
    ends,
    unknown,
    belowCutoff,
    reached,
    missingStats: [...missing].map(([fen, prob]) => ({ fen, prob })).sort((a, b) => b.prob - a.prob),
    usedStats: [...used],
    truncated,
  };
}

/**
 * The trunk of a repertoire: the single line it follows from the initial position until its
 * first choice (several moves in a position). A Scotch repertoire's trunk is 1. e4 e5 2. Nf3
 * Nc6 3. d4. Deviations inside the trunk (1... c5) are other openings, not its holes.
 */
export function repertoireTrunk(rep: Repertoire, root: string = START_FEN): Trunk {
  const positions = new Set<string>();
  let fen = root;
  while (rep.movesAt(fen).length === 1 && !positions.has(fen)) {
    positions.add(fen);
    fen = rep.movesAt(fen)[0]!.toFen;
  }
  return { positions, length: positions.size, end: fen };
}

export interface Trunk {
  /** Positions before the first choice. */
  positions: Set<string>;
  /** Number of moves (plies) of the trunk. */
  length: number;
  /** Position of the first choice (or of the end of a repertoire without any choice). */
  end: string;
}

export interface GapCandidate<K> {
  key: K;
  rep: Repertoire;
  /** `rep.reachable()`, computed once per repertoire. */
  reach: Set<string>;
  /** The line before the repertoire's first choice (`repertoireTrunk`). */
  trunk: Trunk;
}

export function gapCandidate<K>(key: K, rep: Repertoire): GapCandidate<K> {
  return { key, rep, reach: rep.reachable(), trunk: repertoireTrunk(rep) };
}

/**
 * How well a repertoire matches a gap. `owns`: the gap's line gets past the repertoire's trunk
 * (a deviation inside a repertoire's trunk is another opening, not one of its holes). `score`:
 * the longest prepared part of the line; reaching the gap's position (by any move order) beats
 * stopping earlier, and having moves already prepared there wins.
 */
function matchGap<K>(gap: Pick<Gap, 'fen' | 'path'>, c: GapCandidate<K>): { owns: boolean; score: number } {
  if (c.reach.has(gap.fen) && !c.trunk.positions.has(gap.fen)) {
    return { owns: true, score: 2 * (gap.path.length + 1) + (c.rep.movesAt(gap.fen).length ? 1 : 0) };
  }
  let prefix = 0;
  while (prefix < gap.path.length && c.rep.has(gap.path[prefix]!.fromFen, gap.path[prefix]!.uci)) prefix++;
  // Owned only if the line follows the repertoire past its first choice (one of its own moves
  // there), not just along its trunk: a Philidor (1. e4 e5 / 1. e4 d6) does not own 1. e4 c6.
  return { owns: !c.trunk.positions.has(gap.fen) && prefix > c.trunk.length, score: 2 * prefix };
}

/**
 * Repertoires of the same colour ordered by how well they suit a gap: the ones it can belong to
 * first (see `matchGap`), then the others by the longest prepared part of its line. Ties keep the
 * given order.
 */
export function rankRepertoires<K>(gap: Pick<Gap, 'fen' | 'path'>, candidates: GapCandidate<K>[]): { key: K; owns: boolean }[] {
  return candidates
    .map((c, i) => ({ key: c.key, i, ...matchGap(gap, c) }))
    .sort((a, b) => Number(b.owns) - Number(a.owns) || b.score - a.score || a.i - b.i)
    .map(({ key, owns }) => ({ key, owns }));
}

/**
 * The repertoire a gap belongs to, when several repertoires of the same colour are analysed
 * together: the best ranked one that can own it (`rankRepertoires`), or undefined when the gap
 * is inside every repertoire's trunk.
 */
export function gapOwner<K>(gap: Pick<Gap, 'fen' | 'path'>, candidates: GapCandidate<K>[]): K | undefined {
  const best = rankRepertoires(gap, candidates)[0];
  return best?.owns ? best.key : undefined;
}
