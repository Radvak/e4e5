import { describe, expect, it } from 'vitest';
import {
  analyzeGame,
  bucketsFor,
  pgnToMoves,
  playUci,
  Repertoire,
  repertoireToPgn,
  START_FEN,
} from '../src/index.js';

const ITALIAN = `
[Event "Italian"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 {Italian} (3. Bb5 a6) 3... Bc5 (3... Nf6 4. d3) 4. O-O *
`;

describe('position helpers', () => {
  it('normalises castling to e1g1 and accepts both encodings', () => {
    const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -';
    expect(playUci(fen, 'e1g1')?.san).toBe('O-O');
    expect(playUci(fen, 'e1h1')?.uci).toBe('e1g1');
    expect(playUci(fen, 'e1e3')).toBeNull();
  });
});

describe('PGN import', () => {
  it('reads main line and variations, with comments', () => {
    const { moves, errors, games } = pgnToMoves(ITALIAN);
    expect(errors).toEqual([]);
    expect(games).toBe(1);
    expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'd3', 'Bb5', 'a6']);
    expect(moves.find((m) => m.san === 'Bc4')?.comment).toBe('Italian');
    expect(moves.find((m) => m.san === 'Bb5')?.isMain).toBe(false);
    expect(moves.find((m) => m.san === 'O-O')?.uci).toBe('e1g1');
  });

  it('merges transpositions into the same position', () => {
    const { moves } = pgnToMoves('1. e4 e5 2. Nf3 Nc6 *\n\n1. Nf3 Nc6 2. e4 e5 *');
    const rep = new Repertoire('white', moves);
    const a = moves[3]!.toFen;
    const b = moves[7]!.toFen;
    expect(a).toBe(b);
    expect(rep.reachable().has(a)).toBe(true);
  });

  it('reports illegal moves', () => {
    expect(pgnToMoves('1. e4 e4 *').errors.length).toBe(1);
  });
});

describe('repertoire', () => {
  it('finds moves orphaned by a deletion', () => {
    const moves = pgnToMoves(ITALIAN).moves.filter((m) => m.san !== 'Nc6');
    const orphans = new Repertoire('white', moves).unreachableMoves();
    expect(orphans.map((m) => m.san)).toContain('Bc4');
    expect(orphans.map((m) => m.san)).not.toContain('Nf3');
  });

  it('exports to PGN and re-imports the same moves', () => {
    const rep = new Repertoire('white', pgnToMoves(ITALIAN).moves);
    const pgn = repertoireToPgn(rep, 'Italian');
    const again = new Repertoire('white', pgnToMoves(pgn).moves);
    expect(again.size).toBe(rep.size);
  });
});

describe('game analysis', () => {
  const rep = new Repertoire('white', pgnToMoves(ITALIAN).moves);

  it('detects an opponent novelty and my reply', () => {
    const a = analyzeGame(rep, 'e4 c5 Nf3 d6'.split(' '));
    expect(a.kind).toBe('opponent-novelty');
    if (a.kind !== 'opponent-novelty') return;
    expect(a.ply).toBe(1);
    expect(a.played.san).toBe('c5');
    expect(a.myReply?.san).toBe('Nf3');
  });

  it('detects my own deviation', () => {
    const a = analyzeGame(rep, 'e4 e5 Bc4'.split(' '));
    expect(a.kind).toBe('my-deviation');
    if (a.kind === 'my-deviation') expect(a.expected.map((m) => m.san)).toEqual(['Nf3']);
  });

  it('detects the end of preparation', () => {
    const a = analyzeGame(rep, 'e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6'.split(' '));
    expect(a).toMatchObject({ kind: 'end-of-prep', ply: 7 });
  });

  it('starts from the initial position', () => {
    expect(analyzeGame(rep, []).kind).toBe('in-book');
    expect(rep.movesAt(START_FEN)[0]?.san).toBe('e4');
  });
});

describe('explorer buckets', () => {
  it('picks the bucket and its nearest neighbour', () => {
    expect(bucketsFor(1750)).toEqual([1600, 1800]);
    expect(bucketsFor(1620)).toEqual([1400, 1600]);
    expect(bucketsFor(800)).toEqual([0, 1000]);
    expect(bucketsFor(2700)).toEqual([2200, 2500]);
  });
});

describe('training positions', () => {
  it('lists my positions line by line, main line first, with their path', async () => {
    const { trainingPositions } = await import('../src/index.js');
    const rep = new Repertoire('white', pgnToMoves(ITALIAN).moves);
    const positions = trainingPositions(rep);
    const paths = positions.map((p) => p.path.map((m) => m.san).join(' '));
    // Ends of lines (e.g. after 3. Bb5 a6, nothing prepared for White) are not trained.
    expect(paths).toEqual(['', 'e4 e5', 'e4 e5 Nf3 Nc6', 'e4 e5 Nf3 Nc6 Bc4 Bc5', 'e4 e5 Nf3 Nc6 Bc4 Nf6']);
  });

  it('works for Black', async () => {
    const { trainingPositions } = await import('../src/index.js');
    const rep = new Repertoire('black', pgnToMoves('1. e4 (1. d4 d5 2. c4 e6) 1... c5 2. Nf3 d6 *').moves);
    expect(trainingPositions(rep).map((p) => p.path.map((m) => m.san).join(' '))).toEqual(['e4', 'e4 c5 Nf3', 'd4', 'd4 d5 c4']);
  });
});
