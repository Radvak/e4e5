import { localizePgn, parseStudy, studyNodes, type StudyNode } from '@e4e5/core';
import { describe, expect, it } from 'vitest';
import { lineText } from './lines';
import { OPENINGS } from './openings';

/** The moves of a chapter as text, to compare the trees of both languages. */
const shape = (nodes: StudyNode[]): string => nodes.map((n) => `${n.san}(${shape(n.children)})`).join(' ');

describe('library openings', () => {
  it('have unique slugs', () => {
    expect(new Set(OPENINGS.map((o) => o.slug)).size).toBe(OPENINGS.length);
  });

  for (const o of OPENINGS) {
    describe(o.name.en, () => {
      it('has texts in both languages', () => {
        for (const x of [o.name, o.tagline, o.summary, ...o.ideas, ...o.chapters.map((c) => c.name)]) {
          expect(x.fr.trim()).not.toBe('');
          expect(x.en.trim()).not.toBe('');
        }
      });

      it('has a chapter to train', () => {
        expect(o.chapters.some((c) => !c.trap)).toBe(true);
      });

      for (const c of o.chapters) {
        it(`${c.name.en}: legal moves, its side, comments in both languages`, () => {
          const [fr] = parseStudy(c.pgn, 'fr');
          const [en] = parseStudy(c.pgn, 'en');
          expect(fr!.errors).toEqual([]);
          expect(fr!.orientation).toBe(o.color);
          expect(shape(fr!.children)).toBe(shape(en!.children));
          const nodes = [...studyNodes(fr!).values()];
          const enNodes = studyNodes(en!);
          expect(nodes.length).toBeGreaterThan(5);
          for (const n of nodes) {
            // Each comment exists in both languages, and differs (no section forgotten).
            expect(!!n.comment, n.id).toBe(!!enNodes.get(n.id)!.comment);
            if (n.comment) expect(n.comment, n.id).not.toBe(enNodes.get(n.id)!.comment);
          }
          // Every move of the side learnt is explained (lessons, not traps).
          if (!c.trap) expect(nodes.filter((n) => n.color === o.color && !n.comment).map((n) => n.id)).toEqual([]);
          // The PGN of one language still reads the same.
          expect(shape(parseStudy(localizePgn(c.pgn, 'fr'))[0]!.children)).toBe(shape(fr!.children));
        });
      }
    });
  }
});

describe('card text', () => {
  it('numbers the moves', () => {
    expect(lineText('e4 e5 Nf3')).toBe('1. e4 e5 2. Nf3');
  });
});
