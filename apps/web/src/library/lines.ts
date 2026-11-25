/**
 * Library ("Bibliothèque"): the types of its openings, and their lines played out (moves, PGN to
 * create a repertoire from them). The content itself is in openings.ts.
 */
import { playSanOn, positionFromFen, START_FEN, type Color, type PlayedMove } from '@e4e5/core';
import { lang } from '../i18n';

/** A text in both languages of the interface. */
export interface Txt {
  fr: string;
  en: string;
}

/** The text in the language of the interface. */
export const tx = (x: Txt) => (lang === 'fr' ? x.fr : x.en);

export interface LibraryLine {
  name: Txt;
  /** SAN moves from the initial position, without numbers: "d4 d5 Bf4". */
  moves: string;
  /** Explanation shown after a move, by ply (1: White's first move). */
  notes?: Record<number, Txt>;
  /** A trap: shown with a badge, and left out of the repertoire made for training. */
  trap?: boolean;
}

export interface LibraryOpening {
  /** In the URL: /library/london. */
  slug: string;
  /** The side the opening is played with (the repertoire's colour). */
  color: Color;
  name: Txt;
  eco: string;
  /** The moves that define it (SAN from the initial position), shown on its card. */
  moves: string;
  /** 1: easy to start with, 2: more theory, 3: a lot of theory. */
  difficulty: 1 | 2 | 3;
  /** One line on its card. */
  tagline: Txt;
  summary: Txt;
  ideas: Txt[];
  lines: LibraryLine[];
  /** To read more: Lichess opening page (name in its URL) and Wikipedia pages. */
  lichess: string;
  wikipedia: Txt;
}

/** The moves of a SAN line from the initial position; null at the first illegal move. */
export function playLine(moves: string): PlayedMove[] | null {
  const pos = positionFromFen(START_FEN);
  const out: PlayedMove[] = [];
  for (const san of moves.split(/\s+/).filter(Boolean)) {
    const m = playSanOn(pos, san);
    if (!m) return null;
    out.push(m);
  }
  return out;
}

/** "1. d4 d5 2. Bf4", from the ply `from` (0: from the start) to the end. */
export function lineText(moves: string, from = 0): string {
  return moves
    .split(/\s+/)
    .filter(Boolean)
    .map((san, i) => (i < from ? null : i % 2 === 0 ? `${i / 2 + 1}. ${san}` : i === from ? `${(i + 1) / 2}… ${san}` : san))
    .filter(Boolean)
    .join(' ');
}

/** PGN of a line, its notes as comments (in the interface's language), for a chapter of the repertoire. */
export function linePgn(line: LibraryLine): string {
  const sans = line.moves.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  sans.forEach((san, i) => {
    if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
    parts.push(san);
    const note = line.notes?.[i + 1];
    if (note) parts.push(`{ ${tx(note).replace(/[{}]/g, '')} }`);
  });
  return `${parts.join(' ')} *`;
}
