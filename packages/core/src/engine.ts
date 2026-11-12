/** Parsing of UCI engine output (Stockfish "info" lines). */
import { playUciOn, positionFromFen, turnOf, type PlayedMove } from './position.js';

export interface EngineLine {
  /** 1 = best line. */
  multipv: number;
  depth: number;
  /** Evaluation from White's point of view: centipawns, or mate in N moves (negative: Black mates). */
  score: { cp: number } | { mate: number };
  /** Principal variation, legal moves from the analysed position. */
  pv: PlayedMove[];
}

/** UCI position command argument: a full FEN (move counters added to a position key). */
export function uciFen(fen: string): string {
  return fen.split(' ').length >= 6 ? fen : `${fen} 0 1`;
}

/**
 * Parses an "info … multipv N score cp X … pv e2e4 e7e5 …" line for the position `fen`.
 * Returns null for other lines and for bound (non-exact) scores.
 */
export function parseInfo(line: string, fen: string): EngineLine | null {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'info') return null;
  const at = (key: string) => t.indexOf(key);
  const iScore = at('score');
  const iPv = at('pv');
  if (iScore < 0 || iPv < 0) return null;
  if (t[iScore + 3] === 'lowerbound' || t[iScore + 3] === 'upperbound') return null;
  const kind = t[iScore + 1];
  const value = Number(t[iScore + 2]);
  if (!Number.isFinite(value) || (kind !== 'cp' && kind !== 'mate')) return null;
  const sign = turnOf(fen) === 'white' ? 1 : -1;
  const pos = positionFromFen(fen);
  const pv: PlayedMove[] = [];
  for (const uci of t.slice(iPv + 1)) {
    const played = playUciOn(pos, uci);
    if (!played) break;
    pv.push(played);
  }
  if (!pv.length) return null;
  const iMulti = at('multipv');
  return {
    multipv: iMulti >= 0 ? Number(t[iMulti + 1]) : 1,
    depth: Number(t[at('depth') + 1]) || 0,
    score: kind === 'cp' ? { cp: sign * value } : { mate: sign * value },
    pv,
  };
}

/** "+0.35", "-1.20", "#3", "-#2". */
export function formatScore(score: EngineLine['score']): string {
  if ('mate' in score) return `${score.mate < 0 ? '-' : ''}#${Math.abs(score.mate)}`;
  const v = score.cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}
