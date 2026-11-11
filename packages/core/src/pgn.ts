/** PGN <-> repertoire moves. */
import { Chess, type Position } from 'chessops/chess';
import {
  ChildNode,
  defaultGame,
  makePgn,
  parsePgn,
  startingPosition,
  type Node,
  type PgnNodeData,
} from 'chessops/pgn';
import { fenKey, playSanOn } from './position.js';
import type { Repertoire, RepMove } from './repertoire.js';

export interface PgnImport {
  moves: RepMove[];
  games: number;
  errors: string[];
}

/** Removes Lichess/ChessBase annotations like [%cal Ge2e4] or [%clk 0:03:00]. */
function cleanComment(comments: string[] | undefined): string | undefined {
  const text = (comments ?? [])
    .map((c) => c.replace(/\[%[^\]]*\]/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

/**
 * Every move of every game of a PGN, variations included. The first child of a node is the
 * main line. Duplicates (same position + move) are kept here; the repertoire merges them.
 */
export function pgnToMoves(pgn: string): PgnImport {
  const games = parsePgn(pgn);
  const moves: RepMove[] = [];
  const errors: string[] = [];

  games.forEach((game, gi) => {
    let start: Position;
    try {
      start = startingPosition(game.headers).unwrap();
    } catch (e) {
      errors.push(`Game ${gi + 1}: invalid starting position (${String(e)})`);
      return;
    }
    const walk = (node: Node<PgnNodeData>, pos: Position, path: string) => {
      node.children.forEach((child, i) => {
        const next = pos.clone();
        const played = playSanOn(next, child.data.san);
        if (!played) {
          errors.push(`Game ${gi + 1}: illegal move ${child.data.san} after ${path || 'start'}`);
          return;
        }
        moves.push({
          ...played,
          comment: cleanComment(child.data.comments),
          nags: child.data.nags?.length ? child.data.nags : undefined,
          isMain: i === 0,
        });
        walk(child, next, `${path} ${played.san}`.trim());
      });
    };
    walk(game.moves, start, '');
  });

  return { moves, games: games.length, errors };
}

/**
 * The repertoire as one PGN game with variations. A position reached a second time (by
 * transposition) is not expanded again: the move gets a "Transposition" comment instead.
 */
export function repertoireToPgn(rep: Repertoire, name = 'Repertoire'): string {
  const game = defaultGame<PgnNodeData>();
  game.headers.set('Event', name);
  game.headers.set('Result', '*');
  const start = Chess.default();
  const expanded = new Set<string>([fenKey(start)]);

  const build = (parent: Node<PgnNodeData>, pos: Position) => {
    for (const m of rep.movesAt(fenKey(pos))) {
      const comments = m.comment ? [m.comment] : [];
      const next = pos.clone();
      if (!playSanOn(next, m.san)) continue;
      const child = new ChildNode<PgnNodeData>({ san: m.san, comments, nags: m.nags ?? undefined });
      parent.children.push(child);
      if (expanded.has(m.toFen)) {
        comments.push('Transposition');
      } else {
        expanded.add(m.toFen);
        build(child, next);
      }
    }
  };
  build(game.moves, start);
  return makePgn(game);
}
