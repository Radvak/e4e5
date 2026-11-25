import { describe, expect, it } from 'vitest';
import { commentIn, moveLabel, parseStudy, studyLines, studyNodes } from '../src/index.js';

const PGN = `[Event "Test: London"]
[ChapterName "London"]
[Orientation "white"]

{ [fr] Intro française. [en] English intro. } 1. d4 { [%csl Gd4] Centre. } 1... d5 2. Bf4 { [%cal Gc1f4,Rd8d4] Le fou sort. } 2... Nf6 (2... c5 { Attaque d4. } 3. e3 (3. c3 Qb6) 3... Nc6) 3. e3 *

[Event "Test: Black"]
[ChapterName "Black"]
[Orientation "black"]
[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]

1... c6 2. d4 d5 *
`;

describe('study tree', () => {
  const [london, black] = parseStudy(PGN, 'fr');

  it('reads chapters, orientation and intro in the language asked', () => {
    expect(london!.name).toBe('London');
    expect(london!.orientation).toBe('white');
    expect(london!.intro).toBe('Intro française.');
    expect(parseStudy(PGN, 'en')[0]!.intro).toBe('English intro.');
    expect(london!.errors).toEqual([]);
  });

  it('keeps comments, arrows and highlighted squares', () => {
    const d4 = london!.children[0]!;
    expect(d4.comment).toBe('Centre.');
    expect(d4.shapes).toEqual([{ orig: 'd4', color: 'green' }]);
    const bf4 = d4.children[0]!.children[0]!;
    expect(bf4.san).toBe('Bf4');
    expect(bf4.shapes).toEqual([
      { orig: 'c1', dest: 'f4', color: 'green' },
      { orig: 'd8', dest: 'd4', color: 'red' },
    ]);
    expect(moveLabel(bf4)).toBe('2. Bf4');
    expect(moveLabel(bf4.children[1]!)).toBe('2… c5');
  });

  it('lists the lines with where they leave their parent line', () => {
    const lines = studyLines(london!);
    expect(lines.map((l) => l.nodes.map((n) => n.san).join(' '))).toEqual([
      'd4 d5 Bf4 Nf6 e3',
      'd4 d5 Bf4 c5 e3 Nc6',
      'd4 d5 Bf4 c5 c3 Qb6',
    ]);
    expect(lines.map((l) => [l.fork, l.instead?.san, l.depth])).toEqual([
      [0, undefined, 0],
      [3, 'Nf6', 1],
      [4, 'e3', 2],
    ]);
    expect(studyNodes(london!).size).toBe(10);
  });

  it('numbers the moves of a chapter starting from its own position', () => {
    const c6 = black!.children[0]!;
    expect(c6.ply).toBe(1);
    expect(moveLabel(c6)).toBe('1… c6');
    expect(moveLabel(c6.children[0]!)).toBe('2. d4');
  });

  it('picks a language section', () => {
    expect(commentIn('plain', 'en')).toBe('plain');
    expect(commentIn('[fr] seulement', 'en')).toBe('seulement');
  });
});

describe('localizePgn', () => {
  it('keeps one language and the annotations', async () => {
    const { localizePgn } = await import('../src/index.js');
    expect(localizePgn('1. d4 { [%csl Gd4] [fr] Centre. [en] Centre! } d5 { [fr] Oui } *', 'en')).toBe('1. d4 { [%csl Gd4] Centre! } d5 { Oui } *');
  });
});
