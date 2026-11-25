import { describe, expect, it } from 'vitest';
import { linePgn, lineText, playLine } from './lines';
import { OPENINGS } from './openings';

describe('library openings', () => {
  it('have unique slugs', () => {
    expect(new Set(OPENINGS.map((o) => o.slug)).size).toBe(OPENINGS.length);
  });

  for (const o of OPENINGS) {
    describe(o.name.en, () => {
      it('has legal defining moves', () => {
        expect(playLine(o.moves)).not.toBeNull();
      });

      it('has texts in both languages', () => {
        for (const x of [o.name, o.tagline, o.summary, ...o.ideas, ...o.lines.map((l) => l.name)]) {
          expect(x.fr.trim()).not.toBe('');
          expect(x.en.trim()).not.toBe('');
        }
      });

      it('has at least one line to train', () => {
        expect(o.lines.some((l) => !l.trap)).toBe(true);
      });

      for (const line of o.lines) {
        it(`${line.name.en}: legal moves, notes on its plies`, () => {
          const moves = playLine(line.moves);
          expect(moves, line.moves).not.toBeNull();
          for (const ply of Object.keys(line.notes ?? {}).map(Number)) {
            expect(ply).toBeGreaterThanOrEqual(1);
            expect(ply).toBeLessThanOrEqual(moves!.length);
          }
          // Lines to train are played by the opening's side up to their end.
          if (!line.trap) expect(moves!.length).toBeGreaterThan(4);
        });
      }
    });
  }
});

describe('line helpers', () => {
  it('numbers the moves', () => {
    expect(lineText('e4 e5 Nf3')).toBe('1. e4 e5 2. Nf3');
    expect(lineText('e4 e5 Nf3 Nc6', 1)).toBe('1… e5 2. Nf3 Nc6');
  });

  it('writes the notes as PGN comments', () => {
    const pgn = linePgn({ name: { fr: '', en: '' }, moves: 'e4 e5 Nf3', notes: { 2: { fr: 'Symétrique {ok}', en: 'Symmetrical {ok}' } } });
    expect(pgn).toMatch(/^1\. e4 e5 \{ (Symétrique|Symmetrical) ok \} 2\. Nf3 \*$/);
  });
});
