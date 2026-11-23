import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addMove,
  createRepertoire,
  DataError,
  deleteMove,
  exportPgn,
  getRepertoire,
  importPgn,
  listRepertoires,
  positionRepertoires,
  repertoireMovesAt,
  saveLine,
  updateMove,
  type Db,
} from '../src/index.js';
import * as schema from '../src/schema.js';
import { users } from '../src/schema.js';

const MIGRATIONS = fileURLToPath(new URL('../../../apps/server/drizzle', import.meta.url));

let db: Db;
beforeEach(async () => {
  const client = createClient({ url: ':memory:' });
  const d = drizzle(client, { schema });
  await migrate(d, { migrationsFolder: MIGRATIONS });
  await d.insert(users).values([
    { id: 'u1', username: 'u1' },
    { id: 'u2', username: 'u2' },
  ]);
  db = d;
});

const E4_E5 = ['e2e4', 'e7e5'];

describe('repertoires', () => {
  it('lists the repertoires and moves of a position', async () => {
    const white = await createRepertoire(db, 'u1', { name: 'Blancs', color: 'white' });
    const black = await createRepertoire(db, 'u1', { name: 'Noirs', color: 'black' });
    await saveLine(db, 'u1', white.id, [...E4_E5, 'g1f3']);
    await saveLine(db, 'u1', black.id, ['e2e4', 'c7c5']);
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect((await repertoireMovesAt(db, 'u1', afterE4)).map((m) => [m.name, m.san])).toEqual(
      expect.arrayContaining([['Blancs', 'e5'], ['Noirs', 'c5']]),
    );
    const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(await positionRepertoires(db, 'u1', afterE5)).toEqual([{ repertoireId: white.id, name: 'Blancs', color: 'white', moves: 1 }]);
    expect(await repertoireMovesAt(db, 'u2', afterE4)).toEqual([]);
    await expect(positionRepertoires(db, 'u1', 'pas une position')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('saves a line, with the first move of a position as the main one', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Blancs', color: 'white' });
    expect(await saveLine(db, 'u1', rep.id, [...E4_E5, 'g1f3'])).toEqual({ added: 3 });
    expect(await saveLine(db, 'u1', rep.id, [...E4_E5, 'f1c4'])).toEqual({ added: 1 });
    const { moves } = await getRepertoire(db, 'u1', rep.id);
    expect(moves.map((m) => [m.san, m.isMain])).toEqual([
      ['e4', true],
      ['e5', true],
      ['Nf3', true],
      ['Bc4', false],
    ]);
    const [summary] = await listRepertoires(db, 'u1');
    expect(summary!.trunk).toEqual(['e4', 'e5']);
  });

  it('keeps the repertoires of other users out of reach', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Blancs', color: 'white' });
    await expect(getRepertoire(db, 'u2', rep.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await listRepertoires(db, 'u2')).toEqual([]);
  });

  it('refuses an illegal move', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Blancs', color: 'white' });
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await expect(addMove(db, 'u1', rep.id, fen, 'e2e5')).rejects.toBeInstanceOf(DataError);
    expect((await addMove(db, 'u1', rep.id, fen, 'e2e4')).created).toBe(true);
    expect((await addMove(db, 'u1', rep.id, fen, 'e2e4')).created).toBe(false);
  });

  it('hands the main line to another move when the main one is paused', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Blancs', color: 'white' });
    await saveLine(db, 'u1', rep.id, [...E4_E5, 'g1f3']);
    await saveLine(db, 'u1', rep.id, [...E4_E5, 'f1c4']);
    const at = async () => (await getRepertoire(db, 'u1', rep.id)).moves.filter((m) => m.san === 'Nf3' || m.san === 'Bc4');
    const nf3 = (await at()).find((m) => m.san === 'Nf3')!;
    await updateMove(db, 'u1', rep.id, nf3.id, { paused: true });
    expect((await at()).map((m) => [m.san, m.isMain, !!m.paused])).toEqual([
      ['Nf3', false, true],
      ['Bc4', true, false],
    ]);
    // Main again: resumed, and the only main move of the position.
    await updateMove(db, 'u1', rep.id, nf3.id, { isMain: true });
    expect((await at()).map((m) => [m.san, m.isMain, !!m.paused])).toEqual([
      ['Nf3', true, false],
      ['Bc4', false, false],
    ]);
  });

  it('deletes a move with what only follows it', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Blancs', color: 'white' });
    await saveLine(db, 'u1', rep.id, [...E4_E5, 'g1f3', 'b8c6', 'f1b5']);
    const nf3 = (await getRepertoire(db, 'u1', rep.id)).moves.find((m) => m.san === 'Nf3')!;
    expect(await deleteMove(db, 'u1', rep.id, nf3.id)).toEqual({ ok: true, pruned: 2 });
    expect((await getRepertoire(db, 'u1', rep.id)).moves.map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('imports a PGN and exports it back', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Mon répertoire', color: 'white' });
    const result = await importPgn(db, 'u1', rep.id, '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 *');
    expect(result).toMatchObject({ games: 1, added: 7, duplicates: 0, unreachable: 0 });
    expect((await importPgn(db, 'u1', rep.id, '1. e4 e5 2. Nf3 *')).duplicates).toBe(3);
    const { pgn, filename } = await exportPgn(db, 'u1', rep.id);
    expect(filename).toBe('Mon_r_pertoire');
    const other = await createRepertoire(db, 'u1', { name: 'Copie', color: 'white' });
    expect((await importPgn(db, 'u1', other.id, pgn)).added).toBe(7);
  });
});
