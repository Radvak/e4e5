import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGames, sanMoves, type Game } from '../src/lichessGames.js';

describe('sanMoves', () => {
  it('leaves out comments, numbers, annotations and the result', () => {
    const text = '1. e4 { [%clk 0:03:00] } 1... e5?! { [%clk 0:03:00] } 2. Nf3 Nc6 3. Bb5 $1 a6!! 1-0';
    expect(sanMoves(text, 10)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(sanMoves(text, 2)).toEqual(['e4', 'e5']);
  });

  it('skips nested variations and numbers glued to the moves', () => {
    expect(sanMoves('1.e4 c5 (1...e5 2.Nf3 (2.f4 {gambit} exf4) Nc6) 2.Nf3 d6 *', 10)).toEqual(['e4', 'c5', 'Nf3', 'd6']);
    expect(sanMoves('12...Qxd8+ 13.O-O-O', 10)).toEqual(['Qxd8+', 'O-O-O']);
    expect(sanMoves('', 10)).toEqual([]);
  });
});

describe('readGames', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stats-'));
  const file = join(dir, 'games.pgn');
  const game = (elo: number, moves: string) =>
    `[Event "Rated Blitz game"]\n[Site "x"]\n[Result "1-0"]\n[WhiteElo "${elo}"]\n[BlackElo "${elo + 10}"]\n[TimeControl "180+0"]\n\n${moves}\n`;
  writeFileSync(file, [game(1500, '1. e4 e5 1-0'), game(1700, '1. d4 d5 1-0'), game(1900, '1. c4 1-0')].join('\n'));

  it('reads the headers used and the movetext of each game', async () => {
    const games: Game[] = [];
    const r = await readGames(file, { add: (g) => (games.push(g), true) }, Infinity, () => {});
    expect(r).toEqual({ read: 3, kept: 3 });
    expect(games[1]).toEqual({ timeControl: '180+0', whiteElo: 1700, blackElo: 1710, result: '1-0', movetext: '1. d4 d5 1-0' });
  });

  it('stops once enough games are kept, the sink possibly asynchronous', async () => {
    let n = 0;
    const r = await readGames(file, { add: async (g) => (n++, g.whiteElo > 1600) }, 1, () => {});
    expect(r).toEqual({ read: 2, kept: 1 });
    expect(n).toBe(2);
  });
});
