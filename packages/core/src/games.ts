/** Compares a played game with a repertoire: where did the game leave the preparation? */
import { Chess } from 'chessops/chess';
import { fenKey, playSanOn, type PlayedMove } from './position.js';
import type { Repertoire, RepMove } from './repertoire.js';

export type GameAnalysis =
  /** I played something else than my prepared move. */
  | { kind: 'my-deviation'; ply: number; fen: string; played: PlayedMove; expected: RepMove[] }
  /** The opponent played a move I have not prepared. `myReply`: what I answered in the game. */
  | { kind: 'opponent-novelty'; ply: number; fen: string; played: PlayedMove; known: RepMove[]; myReply?: PlayedMove }
  /** The repertoire has nothing more here (end of a prepared line). */
  | { kind: 'end-of-prep'; ply: number; fen: string; next?: PlayedMove }
  /** The whole game stayed inside the repertoire. */
  | { kind: 'in-book'; ply: number };

/** `sans`: the game's moves in SAN, e.g. the space-separated `moves` of the Lichess API. */
export function analyzeGame(rep: Repertoire, sans: string[]): GameAnalysis {
  const pos = Chess.default();
  for (let ply = 0; ply < sans.length; ply++) {
    const fen = fenKey(pos);
    const prepared = rep.movesAt(fen);
    const played = playSanOn(pos, sans[ply]!);
    if (!played) break; // corrupt game: treat as ended
    if (prepared.length === 0) return { kind: 'end-of-prep', ply, fen, next: played };
    if (prepared.some((m) => m.uci === played.uci)) continue;
    if (rep.isMyTurn(fen)) return { kind: 'my-deviation', ply, fen, played, expected: prepared };
    const reply = sans[ply + 1];
    const myReply = reply ? (playSanOn(pos.clone(), reply) ?? undefined) : undefined;
    return { kind: 'opponent-novelty', ply, fen, played, known: prepared, myReply };
  }
  return { kind: 'in-book', ply: sans.length };
}

/** Among several repertoires of my color, the one the game follows the longest. */
export function bestRepertoire<T extends { rep: Repertoire }>(
  candidates: T[],
  sans: string[],
): { candidate: T; analysis: GameAnalysis } | null {
  let best: { candidate: T; analysis: GameAnalysis } | null = null;
  for (const candidate of candidates) {
    const analysis = analyzeGame(candidate.rep, sans);
    if (!best || analysis.ply > best.analysis.ply) best = { candidate, analysis };
  }
  return best;
}
