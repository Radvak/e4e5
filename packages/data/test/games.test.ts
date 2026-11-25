import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChapter,
  createRepertoire,
  dismissInbox,
  gamesReport,
  getChapter,
  myGameMoves,
  myGamesAt,
  recordAnswer,
  restoreInbox,
  saveLine,
  setOpeningsTable,
  startSync,
  syncJobs,
  syncStatus,
  type Db,
  type GameSources,
  type SyncUser,
} from '../src/index.js';
import * as schema from '../src/schema.js';
import { users } from '../src/schema.js';

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));
const OPENINGS = fileURLToPath(new URL('../seed/openings.tsv', import.meta.url));
const SRC: GameSources = { chesscomApi: 'https://chesscom.test', lichessHost: 'https://lichess.test' };
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const user: SyncUser = { id: 'u1', chesscomUsername: 'Moi', lichessUsername: 'moi' };

const now = Date.now();
/** A Chess.com game of mine with White: 1.e4 e5 2.Bc4 (Nf3 prepared), yesterday. */
const chesscomGame = {
  uuid: 'g1',
  url: 'https://www.chess.com/game/live/1',
  pgn: '[Event "Live"]\n\n1. e4 e5 2. Bc4 Nc6 1-0',
  end_time: Math.floor((now - 86_400_000) / 1000),
  rated: true,
  rules: 'chess',
  time_class: 'blitz',
  white: { username: 'Moi', rating: 1500, result: 'win' },
  black: { username: 'Autre', rating: 1490, result: 'resigned' },
};
/** A Lichess game of mine with Black (no repertoire for Black: outside). */
const lichessGame = {
  id: 'abcd1234',
  rated: true,
  variant: 'standard',
  speed: 'rapid',
  createdAt: now - 3_600_000,
  lastMoveAt: now - 3_000_000,
  status: 'draw',
  players: { white: { user: { name: 'Lui', id: 'lui' }, rating: 1600 }, black: { user: { name: 'Moi', id: 'moi' }, rating: 1550 } },
  moves: 'd4 d5 c4 e6',
};

/** The two sites, as fetch sees them. */
const fakeFetch = vi.fn(async (url: string) => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (url === 'https://chesscom.test/pub/player/moi/games/archives') return json({ archives: ['https://api.chess.com/pub/player/moi/games/2026/11'] });
  if (url === 'https://chesscom.test/pub/player/moi/games/2026/11') return json({ games: [chesscomGame] });
  if (url.startsWith('https://lichess.test/api/games/user/moi?')) return new Response(`${JSON.stringify(lichessGame)}\n`, { status: 200 });
  return new Response('not found', { status: 404 });
});

async function sync(db: Db, source: 'chesscom' | 'lichess') {
  startSync(db, user, source, SRC);
  await vi.waitFor(() => expect(syncJobs(user.id).find((j) => j.source === source)?.status).not.toBe('running'));
  return syncJobs(user.id).find((j) => j.source === source)!;
}

let db: Db;
let repId: string;
beforeAll(() => setOpeningsTable(() => readFileSync(OPENINGS, 'utf8')));
beforeEach(async () => {
  vi.stubGlobal('fetch', fakeFetch);
  const client = createClient({ url: ':memory:' });
  const d = drizzle(client, { schema });
  await migrate(d, { migrationsFolder: MIGRATIONS });
  await d.insert(users).values({ id: 'u1', username: 'u1', chesscomUsername: 'Moi', lichessUsername: 'moi' });
  db = d;
  const rep = await createRepertoire(db, 'u1', { name: 'Blancs', color: 'white' });
  repId = (await createChapter(db, 'u1', rep.id, { name: 'Blancs' })).id;
  await saveLine(db, 'u1', repId, ['e2e4', 'e7e5', 'g1f3']);
  const fen = (await getChapter(db, 'u1', repId)).moves.find((m) => m.uci === 'g1f3')!.fromFen;
  await recordAnswer(db, 'u1', repId, { fen, uci: 'g1f3', grade: 'easy' });
});
afterEach(() => vi.unstubAllGlobals());

describe('games', () => {
  it('syncs both sites, once, and makes the position of a recent deviation due', async () => {
    const chesscom = await sync(db, 'chesscom');
    expect(chesscom).toMatchObject({ status: 'done', added: 1, progress: { done: 1, total: 1 }, reviews: 1 });
    expect(await sync(db, 'lichess')).toMatchObject({ status: 'done', added: 1 });
    expect((await sync(db, 'chesscom')).added).toBe(0);
    const status = await syncStatus(db, user);
    expect(status.counts).toEqual({ chesscom: 1, lichess: 1 });
    expect(status.accounts).toEqual({ chesscom: 'Moi', lichess: 'moi' });
  });

  it('refuses a sync without an account', () => {
    expect(() => startSync(db, { ...user, chesscomUsername: null }, 'chesscom', SRC)).toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  it('reports the deviation, the games outside the repertoires and the openings', async () => {
    await sync(db, 'chesscom');
    await sync(db, 'lichess');
    const report = await gamesReport(db, 'u1', { days: 30, speeds: ['blitz', 'rapid'] });
    expect(report.games).toBe(2);
    expect(report.inbox.errors.map((e) => [e.move.san, e.expected])).toEqual([['Bc4', ['Nf3']]]);
    expect(report.outside).toEqual([expect.objectContaining({ color: 'black', games: 1 })]);
    expect(report.openings.map((o) => o.family)).toEqual(expect.arrayContaining(["Bishop's Opening", "Queen's Gambit Declined"]));

    await dismissInbox(db, 'u1', report.inbox.errors[0]!.key);
    expect((await gamesReport(db, 'u1', { days: 30, speeds: ['blitz', 'rapid'] })).inbox.errorCount).toBe(0);
    await restoreInbox(db, 'u1');
    expect((await gamesReport(db, 'u1', { days: 30, speeds: ['blitz', 'rapid'] })).inbox.errorCount).toBe(1);
  });

  it('finds my games in a position, and their moves', async () => {
    await sync(db, 'chesscom');
    const mine = await myGamesAt(db, 'u1', { lichess: 'moi', chesscom: 'Moi' }, { fen: START, color: 'white', speeds: ['blitz'], days: 0 });
    expect(mine.data.moves.map((m) => [m.san, m.white])).toEqual([['e4', 1]]);
    expect(mine.recentGames[0]).toMatchObject({ id: 'chesscom:g1', white: { name: 'Moi', rating: 1500 } });
    expect(await myGameMoves(db, 'u1', 'chesscom:g1')).toEqual(['e4', 'e5', 'Bc4', 'Nc6']);
    expect(await myGameMoves(db, 'u2', 'chesscom:g1')).toBeNull();
  });
});
