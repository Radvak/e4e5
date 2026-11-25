/**
 * A chapter of a study (Lichess study, or a lesson of the app's library) as a tree to read move
 * by move: each move with its comment and the arrows and highlighted squares drawn with it
 * ([%cal], [%csl]), variations included. The first child of a node is the main line.
 *
 * Comments may be written in two languages, "[fr] … [en] …": the one asked is kept (the other
 * one when it is missing).
 */
import type { Position } from 'chessops/chess';
import { parseComment, parsePgn, startingPosition, type Node, type PgnNodeData } from 'chessops/pgn';
import { makeSquare } from 'chessops/util';
import { fenKey, playSanOn, type Color } from './position.js';

export type ShapeColor = 'green' | 'red' | 'yellow' | 'blue';

/** An arrow (`dest` set) or a highlighted square, as drawn in the study. */
export interface StudyShape {
  orig: string;
  dest?: string;
  color: ShapeColor;
}

export interface StudyNode {
  /** The moves from the chapter's start, UCI, comma separated: unique in the tree. */
  id: string;
  /** Half-moves from the chapter's start (1: its first move). */
  ply: number;
  /** Move number shown before it (1 for 1.e4 and 1…e5), from the start position's own count. */
  moveNumber: number;
  /** The side that played it. */
  color: Color;
  san: string;
  uci: string;
  fromFen: string;
  toFen: string;
  /** The text after the move (and before it, in a variation), annotations removed. */
  comment?: string;
  shapes: StudyShape[];
  nags?: number[];
  children: StudyNode[];
}

export interface StudyChapter {
  name: string;
  orientation?: Color;
  startFen: string;
  /** Comment before the first move. */
  intro?: string;
  introShapes: StudyShape[];
  /** The first moves (the first one is the main line). */
  children: StudyNode[];
  errors: string[];
}

/** The text of a comment in one language, from "[fr] … [en] …" (or the whole text). */
export function commentIn(text: string, lang: 'fr' | 'en'): string {
  if (!/\[(fr|en)\]/.test(text)) return text;
  const parts = new Map<string, string>();
  const re = /\[(fr|en)\]([\s\S]*?)(?=\[(?:fr|en)\]|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) parts.set(m[1]!, m[2]!.trim());
  return parts.get(lang) || parts.get(lang === 'fr' ? 'en' : 'fr') || '';
}

function readComments(comments: string[] | undefined, lang: 'fr' | 'en'): { text?: string; shapes: StudyShape[] } {
  const shapes: StudyShape[] = [];
  const texts: string[] = [];
  for (const raw of comments ?? []) {
    const c = parseComment(raw);
    for (const s of c.shapes) {
      shapes.push(s.from === s.to ? { orig: makeSquare(s.from), color: s.color } : { orig: makeSquare(s.from), dest: makeSquare(s.to), color: s.color });
    }
    const text = commentIn(c.text, lang).replace(/\s+/g, ' ').trim();
    if (text) texts.push(text);
  }
  return { text: texts.join(' ') || undefined, shapes };
}

/** The chapters of a study PGN (one game per chapter), as trees. */
export function parseStudy(pgn: string, lang: 'fr' | 'en' = 'fr'): StudyChapter[] {
  return parsePgn(pgn).map((game, gi) => {
    const errors: string[] = [];
    const start = startingPosition(game.headers);
    const pos0 = start.isOk ? start.value : startingPosition(new Map()).unwrap();
    if (!start.isOk) errors.push(`Chapter ${gi + 1}: invalid starting position`);
    const firstPly = 2 * (pos0.fullmoves - 1) + (pos0.turn === 'black' ? 1 : 0);
    const build = (node: Node<PgnNodeData>, pos: Position, path: string, ply: number): StudyNode[] =>
      node.children.flatMap((child) => {
        const next = pos.clone();
        const played = playSanOn(next, child.data.san);
        if (!played) {
          errors.push(`Chapter ${gi + 1}: illegal move ${child.data.san} after ${path || 'the start'}`);
          return [];
        }
        const before = readComments(child.data.startingComments, lang);
        const after = readComments(child.data.comments, lang);
        const id = path ? `${path},${played.uci}` : played.uci;
        const abs = firstPly + ply;
        return [
          {
            id,
            ply: ply + 1,
            moveNumber: Math.floor(abs / 2) + 1,
            color: abs % 2 === 0 ? 'white' : 'black',
            ...played,
            comment: [before.text, after.text].filter(Boolean).join(' ') || undefined,
            shapes: [...before.shapes, ...after.shapes],
            nags: child.data.nags?.length ? child.data.nags : undefined,
            children: build(child, next, id, ply + 1),
          } satisfies StudyNode,
        ];
      });
    const intro = readComments(game.comments, lang);
    const orientation = game.headers.get('Orientation');
    return {
      name: game.headers.get('ChapterName') ?? game.headers.get('Event') ?? `Chapter ${gi + 1}`,
      orientation: orientation === 'white' || orientation === 'black' ? orientation : undefined,
      startFen: fenKey(pos0),
      intro: intro.text,
      introShapes: intro.shapes,
      children: build(game.moves, pos0, '', 0),
      errors,
    };
  });
}

/** Text of a move with its number: "3. Bf4", "3… e6". */
export const moveLabel = (n: Pick<StudyNode, 'moveNumber' | 'color' | 'san'>) => `${n.moveNumber}${n.color === 'white' ? '.' : '…'} ${n.san}`;

/**
 * A line of the chapter: the main line, or a variation with where it leaves its parent line.
 * `nodes` go from the chapter's start to the end of the line; `fork` is the index in `nodes` of
 * its first move off the parent line (0 for the main line), and `instead` the parent's move there.
 */
export interface StudyLine {
  nodes: StudyNode[];
  fork: number;
  instead?: StudyNode;
  /** 0: the main line, 1: a variation of it, 2: a variation of a variation… */
  depth: number;
}

/** Every line of a chapter: the main line first, then each variation after its parent line. */
export function studyLines(chapter: Pick<StudyChapter, 'children'>): StudyLine[] {
  const out: StudyLine[] = [];
  const follow = (prefix: StudyNode[], first: StudyNode, instead: StudyNode | undefined, depth: number) => {
    const nodes = [...prefix, first];
    for (let n = first; n.children[0]; n = n.children[0]) nodes.push(n.children[0]);
    out.push({ nodes, fork: prefix.length, instead, depth });
    // The variations along this line, in order.
    for (let i = prefix.length; i < nodes.length; i++) {
      const parentChildren = i === 0 ? chapter.children : nodes[i - 1]!.children;
      if (nodes[i] !== parentChildren[0]) continue;
      for (const alt of parentChildren.slice(1)) follow(nodes.slice(0, i), alt, nodes[i], depth + 1);
    }
  };
  if (chapter.children[0]) follow([], chapter.children[0], undefined, 0);
  // Variations of the very first move.
  for (const alt of chapter.children.slice(1)) {
    if (!out.some((l) => l.nodes[0] === alt)) follow([], alt, chapter.children[0], 1);
  }
  return out;
}

/** Every node of a chapter, by id. */
export function studyNodes(chapter: Pick<StudyChapter, 'children'>): Map<string, StudyNode> {
  const map = new Map<string, StudyNode>();
  const walk = (nodes: StudyNode[]) =>
    nodes.forEach((n) => {
      map.set(n.id, n);
      walk(n.children);
    });
  walk(chapter.children);
  return map;
}

/**
 * The PGN with its comments in one language ("[fr] … [en] …" sections kept for `lang` only),
 * annotations ([%cal], [%csl]) kept: for a repertoire made from a lesson.
 */
export function localizePgn(pgn: string, lang: 'fr' | 'en'): string {
  return pgn.replace(/\{([^}]*)\}/g, (_, body: string) => {
    const annotations = body.match(/\[%[^\]]*\]/g) ?? [];
    const text = commentIn(body.replace(/\[%[^\]]*\]/g, ''), lang).replace(/\s+/g, ' ').trim();
    const inside = [...annotations, text].filter(Boolean).join(' ');
    return inside ? `{ ${inside} }` : '';
  });
}
