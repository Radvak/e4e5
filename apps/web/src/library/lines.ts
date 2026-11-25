/**
 * Library ("Bibliothèque"): the types of its lessons. A lesson is an opening explained move by
 * move, as a Lichess study: chapters in PGN, each move with its comment ("[fr] … [en] …") and the
 * arrows and squares drawn with it ([%cal], [%csl]), variations included. The content of the
 * app's own lessons is in openings.ts; studies imported from Lichess have the same chapters.
 */
import type { Color } from '@e4e5/core';
import { lang } from '../i18n';

/** A text in both languages of the interface. */
export interface Txt {
  fr: string;
  en: string;
}

/** The text in the language of the interface. */
export const tx = (x: Txt) => (lang === 'fr' ? x.fr : x.en);

export interface LibraryChapter {
  name: string;
  /** PGN of the chapter (one game), comments possibly in both languages. */
  pgn: string;
  /** A trap: shown with a badge, and left out of the repertoire made for training. */
  trap?: boolean;
  /** The side it is studied from (default: the lesson's). */
  orientation?: Color;
}

/** What the page of a lesson shows, for the app's openings and imported studies alike. */
export interface Lesson {
  /** In the URL: /library/london, /library/study/<id>. */
  path: string;
  /** The side the opening is played with (the repertoire's colour, the board's orientation). */
  color: Color;
  name: string;
  /** Under the name: ECO codes, author… */
  meta?: string;
  difficulty?: 1 | 2 | 3;
  summary?: string;
  ideas?: string[];
  chapters: LibraryChapter[];
  links?: { label: string; href: string }[];
}

export interface LibraryOpening {
  slug: string;
  color: Color;
  name: Txt;
  eco: string;
  /** The moves that define it (SAN from the initial position), shown on its card. */
  moves: string;
  /** 1: easy to start with, 2: more theory, 3: a lot of theory. */
  difficulty: 1 | 2 | 3;
  tagline: Txt;
  summary: Txt;
  ideas: Txt[];
  chapters: { name: Txt; pgn: string; trap?: boolean }[];
  /** To read more: Lichess opening page (name in its URL) and Wikipedia pages. */
  lichess: string;
  wikipedia: Txt;
}

/** An opening of the app as a lesson, in the interface's language. */
export function openingLesson(o: LibraryOpening): Lesson {
  return {
    path: `/library/${o.slug}`,
    color: o.color,
    name: tx(o.name),
    meta: o.eco,
    difficulty: o.difficulty,
    summary: tx(o.summary),
    ideas: o.ideas.map(tx),
    chapters: o.chapters.map((c) => ({ name: tx(c.name), pgn: c.pgn, trap: c.trap })),
    links: [
      { label: 'Lichess', href: `https://lichess.org/opening/${o.lichess}` },
      { label: 'Wikipedia', href: tx(o.wikipedia) },
    ],
  };
}

/** "1. d4 d5 2. Bf4", for the cards. */
export function lineText(moves: string): string {
  return moves
    .split(/\s+/)
    .filter(Boolean)
    .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san))
    .join(' ');
}
