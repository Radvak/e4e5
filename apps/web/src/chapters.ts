/** Chapters on the device: their names, and where a line or a position belongs. */
import { fenKey, pathTo, playUci, positionFromFen, Repertoire, START_FEN, type Color, type PlayedMove } from '@e4e5/core';
import type { ChapterInfo, StoredMove } from './api';

/** "Repertoire › Chapter", or the repertoire's name alone for its chapter of the same name. */
export function chapterLabel(c: { repertoireName: string; chapterName: string }): string {
  return c.chapterName === c.repertoireName ? c.repertoireName : `${c.repertoireName} › ${c.chapterName}`;
}

/** Where the lines of a chapter start (fenKey). */
export function chapterRoot(c: Pick<ChapterInfo, 'startFen'>): string {
  if (!c.startFen) return START_FEN;
  try {
    return fenKey(positionFromFen(c.startFen));
  } catch {
    return START_FEN;
  }
}

/** The moves of one chapter, as a graph. */
export function chapterGraph(color: Color, moves: StoredMove[], chapterId: string): Repertoire {
  return new Repertoire(color, moves.filter((m) => m.chapterId === chapterId));
}

/** The moves of a line (UCI) from a position; stops at the first illegal one. */
export function playLine(from: string, ucis: string[]): PlayedMove[] {
  const moves: PlayedMove[] = [];
  for (const uci of ucis) {
    const m = playUci(moves.at(-1)?.toFen ?? from, uci);
    if (!m) break;
    moves.push(m);
  }
  return moves;
}

/**
 * The chapter a line from the initial position belongs to best: the one following it the
 * furthest (a chapter starting at a position counts from there, if the line goes through it),
 * the first chapter on a tie. Answers the chapter and the line from its start.
 */
export function chapterForLine(
  color: Color,
  chapters: ChapterInfo[],
  moves: StoredMove[],
  line: PlayedMove[],
): { chapter: ChapterInfo; line: PlayedMove[] } | null {
  let best: { chapter: ChapterInfo; line: PlayedMove[]; score: number } | null = null;
  for (const chapter of chapters) {
    const root = chapterRoot(chapter);
    const start = root === START_FEN ? 0 : line.findIndex((m) => m.toFen === root) + 1;
    if (root !== START_FEN && start === 0) continue;
    const graph = chapterGraph(color, moves, chapter.id);
    const rest = line.slice(start);
    let score = 0;
    while (score < rest.length && graph.has(rest[score]!.fromFen, rest[score]!.uci)) score++;
    // Counted from the initial position: a chapter starting on the line has its first moves.
    const total = start + score;
    if (!best || total > best.score) best = { chapter, line: rest, score: total };
  }
  return best && { chapter: best.chapter, line: best.line };
}

/** The first chapter containing a position, with the path to it from the chapter's start. */
export function chapterForPosition(
  color: Color,
  chapters: ChapterInfo[],
  moves: StoredMove[],
  fen: string,
): { chapter: ChapterInfo; line: PlayedMove[] } | null {
  for (const chapter of chapters) {
    const path = pathTo(chapterGraph(color, moves, chapter.id), fen, chapterRoot(chapter));
    if (path) return { chapter, line: path };
  }
  return null;
}
