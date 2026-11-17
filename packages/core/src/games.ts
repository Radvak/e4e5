/** Compares a played game with a repertoire: where did the game leave the preparation? */
import { Chess } from 'chessops/chess';
import { fenKey, playSanOn, type PlayedMove } from './position.js';
import type { Repertoire, RepMove } from './repertoire.js';

export type GameAnalysis =
  /** I played something else than my prepared move. */
  | { kind: 'my-deviation'; ply: number; fen: string; played: PlayedMove; expected: RepMove[] }
  /** The opponent played a move I have not prepared. */
  | { kind: 'opponent-novelty'; ply: number; fen: string; played: PlayedMove }
  /** The repertoire has nothing more here (end of a prepared line). */
  | { kind: 'end-of-prep'; ply: number; fen: string; next?: PlayedMove }
  /** The whole game stayed inside the repertoire. */
  | { kind: 'in-book'; ply: number };

/**
 * The moves of a game, played on demand: comparing many games with repertoires only needs the
 * opening, so later moves are never parsed.
 */
export class GameLine {
  private pos = Chess.default();
  private played: PlayedMove[] = [];
  private broken = false;

  constructor(readonly sans: readonly string[]) {}

  /** The move of ply `i` (0 = White's first move), or null after the end (or an illegal move). */
  at(i: number): PlayedMove | null {
    while (this.played.length <= i && !this.broken && this.played.length < this.sans.length) {
      const m = playSanOn(this.pos, this.sans[this.played.length]!);
      if (m) this.played.push(m);
      else this.broken = true;
    }
    return this.played[i] ?? null;
  }

  /** The first `n` moves (fewer if the game is shorter). */
  slice(n: number): PlayedMove[] {
    this.at(n - 1);
    return this.played.slice(0, n);
  }
}

/** `sans`: the game's moves in SAN, e.g. the space-separated `moves` of the Lichess API. */
export function analyzeGame(rep: Repertoire, game: string[] | GameLine): GameAnalysis {
  const line = game instanceof GameLine ? game : new GameLine(game);
  for (let ply = 0; ; ply++) {
    const played = line.at(ply);
    if (!played) return { kind: 'in-book', ply };
    const fen = played.fromFen;
    const prepared = rep.movesAt(fen);
    if (prepared.length === 0) return { kind: 'end-of-prep', ply, fen, next: played };
    if (prepared.some((m) => m.uci === played.uci)) continue;
    if (rep.isMyTurn(fen)) return { kind: 'my-deviation', ply, fen, played, expected: prepared };
    return { kind: 'opponent-novelty', ply, fen, played };
  }
}

/**
 * The moves (SAN) of a single-game PGN (e.g. a Chess.com game): tags, comments (clocks),
 * NAGs, variations, move numbers and the result are dropped. `standard`: false when the game
 * starts from a custom position (SetUp / FEN tags), which repertoires cannot be compared with.
 */
export function gameMovesFromPgn(pgn: string): { sans: string[]; standard: boolean } {
  const fen = /\[FEN "([^"]*)"\]/.exec(pgn)?.[1];
  const standard = !fen || fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq');
  let text = pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  // Variations, innermost first.
  for (let prev = ''; prev !== text; ) [prev, text] = [text, text.replace(/\([^()]*\)/g, ' ')];
  const sans = text
    .split(/\s+/)
    .map((t) => t.replace(/^\d+\.(\.\.)?/, ''))
    .filter((t) => t && !/^(\$\d+|1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  return { sans, standard };
}
