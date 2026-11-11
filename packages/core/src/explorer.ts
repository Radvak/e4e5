/** Lichess opening explorer: types and parameter helpers (shared by server and web). */

export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical';

/** Rating buckets of the Lichess explorer: 1600 means 1600-1799, etc. */
export const RATING_BUCKETS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}

export interface ExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  opening?: { eco: string; name: string } | null;
}

/**
 * Buckets for "players of my level": the bucket containing the rating, plus its closest
 * neighbour (above if the rating is in the upper half of its bucket, below otherwise).
 */
export function bucketsFor(rating: number): number[] {
  const b = RATING_BUCKETS;
  let i = 0;
  while (i + 1 < b.length && rating >= b[i + 1]!) i++;
  const lo = b[i]!;
  const hi = b[i + 1] ?? lo + 300;
  const [preferred, other] = rating - lo >= (hi - lo) / 2 ? [b[i + 1], b[i - 1]] : [b[i - 1], b[i + 1]];
  const neighbour = preferred ?? other;
  return neighbour === undefined ? [lo] : [lo, neighbour].sort((x, y) => x - y);
}

export function totalGames(x: { white: number; draws: number; black: number }): number {
  return x.white + x.draws + x.black;
}

/** Lichess sometimes encodes castling as king-takes-rook; use e1g1 style. */
export function normaliseExplorerUci(uci: string, san: string): string {
  if (!san.startsWith('O-O')) return uci;
  return ({ e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' } as Record<string, string>)[uci] ?? uci;
}
