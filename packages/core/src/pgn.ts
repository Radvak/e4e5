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
import { fenKey, playSanOn, type Color } from './position.js';
import { trunkOf, type Repertoire, type RepMove, type Thumbnail } from './repertoire.js';

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
 * What a chapter is about, from its moves and headers:
 * - opening: lines from the initial position (or joining them), the stuff of a repertoire;
 * - game: one long main line from the initial position, a played game (players, result) or a
 *   line going further than an opening does (annotated games, model games);
 * - endgame: starts from its own position with few pieces left (kings and pawns aside);
 * - position: starts from its own position, the rest (middlegame, tactics, exercises).
 * Only openings and games can join a repertoire (they start from the initial position).
 */
export type ChapterKind = 'opening' | 'game' | 'endgame' | 'position';

/** Pieces other than kings and pawns at most, for a position to be an endgame. */
const ENDGAME_PIECES = 4;
/** A main line this long (half-moves from the initial position) is a game, not an opening. */
const GAME_PLIES = 60;
/** …or this long with the players and a result in the headers. */
const PLAYED_GAME_PLIES = 30;

/** A game of a PGN with several (a chapter of a Lichess study), to choose which to import. */
export interface PgnChapter {
  /** ChapterName (Lichess studies), else Event, else "Partie n". */
  name: string;
  /** Orientation header (Lichess study chapters): the side the chapter is studied from. */
  orientation?: Color;
  /**
   * Its moves can join a repertoire: it starts from the initial position, or from a position
   * reached by another such chapter (Lichess chapters often start after a few moves).
   */
  joins: boolean;
  /** What it is about (an opening, a game, an endgame, another position). */
  kind: ChapterKind;
  /** Moves of the chapter, variations included. */
  moves: number;
  /** Deepest half-move of the chapter, counted from the initial position (its FEN's move number). */
  maxPly: number;
  /** Its trunk, for a thumbnail: the position where its lines split, and their first moves. */
  trunk: Thumbnail;
  /** The chapter alone, as PGN. */
  pgn: string;
}

/** The games of a PGN one by one (chapters of a Lichess study export). */
export function pgnChapters(pgn: string): PgnChapter[] {
  const initial = fenKey(Chess.default());
  const chapters = parsePgn(pgn).map((game, i) => {
    const count = (node: Node<PgnNodeData>): number => node.children.reduce((n, c) => n + 1 + count(c), 0);
    const depth = (node: Node<PgnNodeData>): number => Math.max(0, ...node.children.map((c) => 1 + depth(c)));
    const orientation = game.headers.get('Orientation');
    const start = startingPosition(game.headers);
    const startKey = start.isOk ? fenKey(start.value) : initial;
    const firstPly = start.isOk ? 2 * (start.value.fullmoves - 1) + (start.value.turn === 'black' ? 1 : 0) : 0;
    const text = makePgn(game);
    const moves = pgnToMoves(text).moves;
    // Half-moves from the chapter's start to each position it reaches (fewest first).
    const plies = new Map<string, number>([[startKey, 0]]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const m of moves) {
        const p = plies.get(m.fromFen);
        if (p === undefined || (plies.get(m.toFen) ?? Infinity) <= p + 1) continue;
        plies.set(m.toFen, p + 1);
        grew = true;
      }
    }
    const depthOf = depth(game.moves);
    let mainLine = 0;
    for (let n: Node<PgnNodeData> | undefined = game.moves.children[0]; n; n = n.children[0]) mainLine++;
    const board = start.isOk ? start.value.board : null;
    const pieces = board ? board.occupied.diff(board.pawn).diff(board.king).size() : 32;
    const player = (h: string) => !!game.headers.get(h) && game.headers.get(h) !== '?';
    const played = player('White') && player('Black') && ['1-0', '0-1', '1/2-1/2'].includes(game.headers.get('Result') ?? '');
    return {
      chapter: {
        name: game.headers.get('ChapterName') || game.headers.get('Event') || `Partie ${i + 1}`,
        ...(orientation === 'white' || orientation === 'black' ? { orientation } : {}),
        joins: false,
        kind: pieces <= ENDGAME_PIECES ? 'endgame' : 'position',
        moves: count(game.moves),
        maxPly: firstPly + depthOf,
        trunk: trunkOf(moves, startKey),
        pgn: text,
      } as PgnChapter,
      start: start.isOk ? startKey : null,
      plies,
      depth: depthOf,
      mainLine,
      played,
    };
  });
  // Joined: from the initial position, then from a position a joined chapter reaches, and so on.
  // Lichess writes "0 1" as the move number of a chapter's FEN: a joined chapter's depth counts
  // from the half-move where the others reach its start instead.
  const reached = new Map([[initial, 0]]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of chapters) {
      const at = c.start === null ? undefined : reached.get(c.start);
      if (c.chapter.joins || at === undefined) continue;
      c.chapter.joins = changed = true;
      c.chapter.maxPly = at + c.depth;
      const line = at + c.mainLine;
      c.chapter.kind = line >= GAME_PLIES || (c.played && line >= PLAYED_GAME_PLIES) ? 'game' : 'opening';
      for (const [f, p] of c.plies) if ((reached.get(f) ?? Infinity) > at + p) reached.set(f, at + p);
    }
  }
  return chapters.map((c) => c.chapter);
}

/**
 * A Lichess study from what the user pasted: a study or chapter link
 * (https://lichess.org/study/abcd1234[/efgh5678]) or the study id alone. Null if not one.
 */
export function lichessStudyRef(input: string): { studyId: string; chapterId?: string } | null {
  const s = input.trim();
  const link = s.match(/^(?:https?:\/\/)?(?:[a-z]+\.)?lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?(?:[/?#].*)?$/);
  if (link) return { studyId: link[1]!, ...(link[2] ? { chapterId: link[2] } : {}) };
  return /^[A-Za-z0-9]{8}$/.test(s) ? { studyId: s } : null;
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
