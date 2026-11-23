/**
 * A repertoire is a graph of positions (keyed by fenKey) linked by moves. A graph rather than
 * a tree: transpositions merge into the same node automatically.
 *
 * Any position can have several moves, for either side (e.g. two prepared answers for me).
 */
import { START_FEN, turnOf, type Color } from './position.js';

export interface RepMove {
  fromFen: string;
  toFen: string;
  uci: string;
  san: string;
  comment?: string | null;
  nags?: number[] | null;
  isMain?: boolean | null;
  /** Left out of the training, with everything only reachable through it (still in the repertoire). */
  paused?: boolean;
}

/**
 * The graph the training uses: without the paused moves, so the positions only reachable through
 * one of them are not trained (a position also reached by another move order still is).
 */
export function trainingRepertoire(color: Color, moves: Iterable<RepMove>): Repertoire {
  return new Repertoire(color, [...moves].filter((m) => !m.paused));
}

export class Repertoire {
  readonly color: Color;
  private byFen = new Map<string, RepMove[]>();

  constructor(color: Color, moves: Iterable<RepMove> = []) {
    this.color = color;
    for (const m of moves) this.add(m);
  }

  /** Adds a move; false if the same move already exists from that position. */
  add(move: RepMove): boolean {
    const list = this.byFen.get(move.fromFen);
    if (!list) {
      this.byFen.set(move.fromFen, [move]);
      return true;
    }
    if (list.some((m) => m.uci === move.uci)) return false;
    list.push(move);
    return true;
  }

  has(fen: string, uci: string): boolean {
    return this.byFen.get(fen)?.some((m) => m.uci === uci) ?? false;
  }

  /** Moves from a position, main line first. */
  movesAt(fen: string): RepMove[] {
    const list = this.byFen.get(fen) ?? [];
    return [...list].sort((a, b) => Number(!!b.isMain) - Number(!!a.isMain));
  }

  isMyTurn(fen: string): boolean {
    return turnOf(fen) === this.color;
  }

  *all(): Iterable<RepMove> {
    for (const list of this.byFen.values()) yield* list;
  }

  get size(): number {
    let n = 0;
    for (const list of this.byFen.values()) n += list.length;
    return n;
  }

  /** Position keys reachable from `root` (the initial position by default). */
  reachable(root: string = START_FEN): Set<string> {
    const seen = new Set<string>([root]);
    const stack = [root];
    while (stack.length) {
      const fen = stack.pop()!;
      for (const m of this.byFen.get(fen) ?? []) {
        if (!seen.has(m.toFen)) {
          seen.add(m.toFen);
          stack.push(m.toFen);
        }
      }
    }
    return seen;
  }

  /** Moves that cannot be reached from the initial position (e.g. after deleting a parent). */
  unreachableMoves(root: string = START_FEN): RepMove[] {
    const reach = this.reachable(root);
    return [...this.all()].filter((m) => !reach.has(m.fromFen));
  }
}

/** The trunk of some moves: the line from `start` while there is one move only, then where it splits. */
export interface Thumbnail {
  /** Position at the end of the trunk. */
  fen: string;
  /** Its moves (SAN). */
  sans: string[];
  /** The moves from that position (UCI): the first moves of the variations. */
  branches: string[];
}

/** The trunk of `moves` from `start` (a thumbnail: the position, the variations as arrows). */
export function trunkOf(moves: Iterable<Pick<RepMove, 'fromFen' | 'toFen' | 'san' | 'uci'>>, start: string = START_FEN): Thumbnail {
  const from = new Map<string, Pick<RepMove, 'toFen' | 'san' | 'uci'>[]>();
  for (const m of moves) {
    const out = from.get(m.fromFen);
    if (!out) from.set(m.fromFen, [m]);
    else if (!out.some((o) => o.uci === m.uci)) out.push(m);
  }
  const sans: string[] = [];
  let fen = start;
  const seen = new Set([fen]);
  for (;;) {
    const out = from.get(fen);
    const only = out?.length === 1 ? out[0] : undefined;
    if (!only || seen.has(only.toFen)) break;
    sans.push(only.san);
    fen = only.toFen;
    seen.add(fen);
  }
  return { fen, sans, branches: (from.get(fen) ?? []).map((m) => m.uci) };
}
