import { describe, expect, it } from 'vitest';
import { lichessStudyRef, pgnChapters, pgnToMoves, START_FEN, trunkOf } from '../src/index.js';

// The shape of a Lichess study export (?orientation=true): one game per chapter.
const STUDY = `[Event "My study: Intro"]
[StudyName "My study"]
[ChapterName "Intro"]
[Orientation "black"]

{ Welcome } *

[Event "My study: Main line"]
[StudyName "My study"]
[ChapterName "Main line"]
[Orientation "black"]

1. e4 c6 2. d4 d5 (2... g6 3. Nc3) 3. e5 *

[Event "My study: Classical"]
[ChapterName "Classical"]
[Orientation "black"]
[FEN "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 1"]
[SetUp "1"]

1. Nc3 dxe4 *

[Event "My study: Endgame"]
[ChapterName "Endgame"]
[Orientation "white"]
[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]
[SetUp "1"]

1. Kd2 *
`;

describe('pgn chapters', () => {
  it('splits a study export into its chapters: orientation, and whether they join the others', () => {
    const chapters = pgnChapters(STUDY);
    expect(chapters.map(({ pgn: _, trunk: __, ...c }) => c)).toEqual([
      { name: 'Intro', orientation: 'black', joins: true, kind: 'opening', moves: 0, maxPly: 0 },
      { name: 'Main line', orientation: 'black', joins: true, kind: 'opening', moves: 7, maxPly: 5 },
      // Starts after 1. e4 c6 2. d4 d5, reached by the main line: its depth counts from there
      // (the FEN says move 1).
      { name: 'Classical', orientation: 'black', joins: true, kind: 'opening', moves: 2, maxPly: 6 },
      { name: 'Endgame', orientation: 'white', joins: false, kind: 'endgame', moves: 1, maxPly: 1 },
    ]);
    // Trunks: where the lines split, and their first moves.
    expect(chapters[0]!.trunk).toEqual({ fen: START_FEN, sans: [], branches: [] });
    expect(chapters[1]!.trunk).toMatchObject({ sans: ['e4', 'c6', 'd4'], branches: ['d7d5', 'g7g6'] });
    expect(chapters[2]!.trunk).toMatchObject({ sans: ['Nc3', 'dxe4'], branches: [] });
    // Each chapter alone imports the same moves.
    expect(pgnToMoves(chapters[1]!.pgn).moves.map((m) => m.san)).toEqual(['e4', 'c6', 'd4', 'd5', 'e5', 'g6', 'Nc3']);
  });

  it('tells openings from games, endgames and other positions', () => {
    // 16 moves of a played game (players, result), then 31 moves of an unnamed line.
    const game = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3 g6 15. a4 c5 16. d5 c4';
    const long = `${game} 17. Bg5 h6 18. Be3 Nc5 19. Qd2 h5 20. Bg5 Be7 21. Ra3 Kg7 22. Rea1 Rh8 23. Nf1 Nfd7 24. Bxe7 Qxe7 25. Ne3 Rab8 26. axb5 axb5 27. Ra7 Rb7 28. Rxb7 Bxb7 29. Ra7 Rb8 30. Nh2 Nf6 31. Nf3 Nfd7`;
    const pgn = `[ChapterName "Model game"]
[White "Carlsen, Magnus"]
[Black "Caruana, Fabiano"]
[Result "1-0"]

${game} 1-0

[ChapterName "Long line"]
[White "?"]
[Black "?"]
[Result "*"]

${long} *

[ChapterName "Same moves, no players"]
[Result "*"]

${game} *

[ChapterName "Middlegame"]
[FEN "r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N2N2/PP2BPPP/R2QKB1R w KQ - 0 9"]
[SetUp "1"]

9. O-O *
`;
    expect(pgnChapters(pgn).map((c) => [c.name, c.kind, c.joins])).toEqual([
      ['Model game', 'game', true],
      ['Long line', 'game', true],
      ['Same moves, no players', 'opening', true],
      ['Middlegame', 'position', false],
    ]);
  });

  it('reads a study link, a chapter link or an id', () => {
    expect(lichessStudyRef('https://lichess.org/study/jtlLwUvh')).toEqual({ studyId: 'jtlLwUvh' });
    expect(lichessStudyRef('lichess.org/study/jtlLwUvh/ccJj8Q0b#12')).toEqual({ studyId: 'jtlLwUvh', chapterId: 'ccJj8Q0b' });
    expect(lichessStudyRef(' jtlLwUvh ')).toEqual({ studyId: 'jtlLwUvh' });
    expect(lichessStudyRef('caro-kann')).toBeNull();
    expect(lichessStudyRef('https://example.org/study/jtlLwUvh')).toBeNull();
  });

  it('finds the trunk of moves: one move at a time, then the variations', () => {
    const moves = pgnToMoves('1. e4 c5 2. Nf3 (2. c3) *').moves;
    expect(trunkOf([...moves, ...moves])).toMatchObject({ sans: ['e4', 'c5'], branches: ['g1f3', 'c2c3'] });
    expect(trunkOf([])).toEqual({ fen: START_FEN, sans: [], branches: [] });
  });
});
