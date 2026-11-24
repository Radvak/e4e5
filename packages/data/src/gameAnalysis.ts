/**
 * Compares the user's games with their repertoires: for each game, where it leaves the
 * preparation and the repertoire that place belongs to. Recomputed on demand (cheap: only the opening of each
 * game is parsed), so it always reflects the current repertoires.
 */
import {
  analyzeGame,
  GameLine,
  gapCandidate,
  rankRepertoires,
  Repertoire,
  type Color,
  type GameAnalysis,
  type GapCandidate,
  type PlayedMove,
} from '@e4e5/core';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db.js';
import { games, graphColumns, repertoires, repMoves } from './schema.js';

export interface RepInfo {
  id: string;
  name: string;
  color: Color;
  /** false: paused by the user. */
  active: boolean;
  rep: Repertoire;
  gap: GapCandidate<string>;
}

export async function loadRepertoires(db: Db, userId: string): Promise<RepInfo[]> {
  const reps = await db.select().from(repertoires).where(eq(repertoires.userId, userId));
  if (!reps.length) return [];
  const moves = await db.select(graphColumns).from(repMoves).where(inArray(repMoves.repertoireId, reps.map((r) => r.id)));
  return reps.map((r) => {
    const rep = new Repertoire(r.color, moves.filter((m) => m.repertoireId === r.id));
    return { id: r.id, name: r.name, color: r.color, active: r.active, rep, gap: gapCandidate(r.id, rep) };
  });
}

type Game = typeof games.$inferSelect;

export interface GameReport {
  game: Game;
  /** Repertoire the game follows the longest; null when outside all of them. */
  repertoireId: string | null;
  /**
   * Where the game leaves the repertoire (see core `analyzeGame`). `outside`: no repertoire of
   * that colour, or I played another first move than all of them (another opening of mine).
   */
  kind: GameAnalysis['kind'] | 'outside';
  /** Plies played in the repertoire. */
  ply: number;
  /** Position where it leaves the repertoire. */
  fen: string;
  /** Moves from the start to `fen`. */
  path: PlayedMove[];
  /** The move played there (mine for a deviation, the opponent's otherwise). */
  played: PlayedMove | null;
  /** My prepared moves, for a deviation. */
  expected: string[];
}

/**
 * Each game is compared with all the repertoires of its colour merged (so transpositions from
 * one repertoire into another are followed), then given to the best suited repertoire at the
 * place it leaves the preparation (same trunk logic as the gap finder).
 */
export function analyseGames(rows: Game[], reps: RepInfo[]): GameReport[] {
  const sides = (['white', 'black'] as const).map((color) => {
    const own = reps.filter((r) => r.color === color);
    return { color, own, merged: new Repertoire(color, own.flatMap((r) => [...r.rep.all()])) };
  });
  return rows.map((game) => {
    const line = new GameLine(game.moves);
    const side = sides.find((s) => s.color === game.color)!;
    const outside = (ply: number): GameReport => ({
      game,
      repertoireId: null,
      kind: 'outside',
      ply,
      fen: line.at(ply)?.fromFen ?? '',
      path: line.slice(ply),
      played: line.at(ply),
      expected: [],
    });
    const myFirstPly = game.color === 'white' ? 0 : 1;
    if (!side.own.length) return outside(myFirstPly);
    const a = analyzeGame(side.merged, line);
    if (a.kind === 'my-deviation' && a.ply === myFirstPly) return outside(a.ply);
    const path = line.slice(a.ply);
    const fen = 'fen' in a ? a.fen : (path.at(-1)?.toFen ?? '');
    const owner = rankRepertoires({ fen, path }, side.own.map((r) => r.gap))[0]!.key;
    const base = { game, repertoireId: owner, kind: a.kind, ply: a.ply, fen, path };
    switch (a.kind) {
      case 'in-book':
        return { ...base, played: null, expected: [] };
      case 'my-deviation':
        return { ...base, played: a.played, expected: a.expected.map((m) => m.san) };
      case 'opponent-novelty':
        return { ...base, played: a.played, expected: [] };
      case 'end-of-prep':
        return { ...base, played: a.next ?? null, expected: [] };
    }
  });
}
