import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { Repertoire, repertoireToPgn } from '@e4e5/core';
import {
  addMove,
  createChapter,
  createChapters,
  createRepertoire,
  DataError,
  deleteChapter,
  deleteMove,
  deleteRepertoire,
  getChapter,
  getRepertoire,
  importPgn,
  listRepertoires,
  moveChapters,
  positionChapters,
  chapterMovesAt,
  reorderChapters,
  repertoireGraphs,
  saveLine,
  updateChapter,
  updateMove,
  type Db,
} from '../src/index.js';
import * as schema from '../src/schema.js';
import { users } from '../src/schema.js';

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

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

/** A repertoire with one chapter of the same name: the chapter. */
async function chapterOf(userId: string, name: string, color: 'white' | 'black') {
  const rep = await createRepertoire(db, userId, { name, color });
  return createChapter(db, userId, rep.id, { name });
}

describe('repertoires', () => {
  it('lists the repertoires and moves of a position', async () => {
    const white = await chapterOf('u1', 'Blancs', 'white');
    const black = await chapterOf('u1', 'Noirs', 'black');
    await saveLine(db, 'u1', white.id, [...E4_E5, 'g1f3']);
    await saveLine(db, 'u1', black.id, ['e2e4', 'c7c5']);
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect((await chapterMovesAt(db, 'u1', afterE4)).map((m) => [m.chapterName, m.san])).toEqual(
      expect.arrayContaining([['Blancs', 'e5'], ['Noirs', 'c5']]),
    );
    const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(await positionChapters(db, 'u1', afterE5)).toEqual([
      { chapterId: white.id, chapterName: 'Blancs', repertoireId: white.repertoireId, repertoireName: 'Blancs', color: 'white', moves: 1 },
    ]);
    expect(await chapterMovesAt(db, 'u2', afterE4)).toEqual([]);
    await expect(positionChapters(db, 'u1', 'pas une position')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('saves a line, with the first move of a position as the main one', async () => {
    const rep = await chapterOf('u1', 'Blancs', 'white');
    expect(await saveLine(db, 'u1', rep.id, [...E4_E5, 'g1f3'])).toEqual({ added: 3 });
    expect(await saveLine(db, 'u1', rep.id, [...E4_E5, 'f1c4'])).toEqual({ added: 1 });
    const { moves } = await getChapter(db, 'u1', rep.id);
    expect(moves.map((m) => [m.san, m.isMain])).toEqual([
      ['e4', true],
      ['e5', true],
      ['Nf3', true],
      ['Bc4', false],
    ]);
    const [summary] = await listRepertoires(db, 'u1');
    expect(summary!.chapters[0]!.trunk).toEqual(['e4', 'e5']);
  });

  it('keeps the repertoires of other users out of reach', async () => {
    const rep = await chapterOf('u1', 'Blancs', 'white');
    await expect(getChapter(db, 'u2', rep.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(createChapter(db, 'u2', rep.repertoireId, { name: 'Intrus' })).rejects.toMatchObject({ statusCode: 404 });
    expect(await listRepertoires(db, 'u2')).toEqual([]);
  });

  it('refuses an illegal move', async () => {
    const rep = await chapterOf('u1', 'Blancs', 'white');
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await expect(addMove(db, 'u1', rep.id, fen, 'e2e5')).rejects.toBeInstanceOf(DataError);
    expect((await addMove(db, 'u1', rep.id, fen, 'e2e4')).created).toBe(true);
    expect((await addMove(db, 'u1', rep.id, fen, 'e2e4')).created).toBe(false);
  });

  it('hands the main line to another move when the main one is paused', async () => {
    const rep = await chapterOf('u1', 'Blancs', 'white');
    await saveLine(db, 'u1', rep.id, [...E4_E5, 'g1f3']);
    await saveLine(db, 'u1', rep.id, [...E4_E5, 'f1c4']);
    const at = async () => (await getChapter(db, 'u1', rep.id)).moves.filter((m) => m.san === 'Nf3' || m.san === 'Bc4');
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
    const rep = await chapterOf('u1', 'Blancs', 'white');
    await saveLine(db, 'u1', rep.id, [...E4_E5, 'g1f3', 'b8c6', 'f1b5']);
    const nf3 = (await getChapter(db, 'u1', rep.id)).moves.find((m) => m.san === 'Nf3')!;
    expect(await deleteMove(db, 'u1', rep.id, nf3.id)).toEqual({ ok: true, pruned: 2 });
    expect((await getChapter(db, 'u1', rep.id)).moves.map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('imports a PGN, and the PGN of the chapter back into another', async () => {
    const rep = await chapterOf('u1', 'Mon répertoire', 'white');
    const result = await importPgn(db, 'u1', rep.id, '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 *');
    expect(result).toMatchObject({ games: 1, added: 7, duplicates: 0, unreachable: 0 });
    expect((await importPgn(db, 'u1', rep.id, '1. e4 e5 2. Nf3 *')).duplicates).toBe(3);
    const pgn = repertoireToPgn(new Repertoire('white', (await getChapter(db, 'u1', rep.id)).moves));
    const other = await chapterOf('u1', 'Copie', 'white');
    expect((await importPgn(db, 'u1', other.id, pgn)).added).toBe(7);
  });
});

describe('chapters', () => {
  it('lists the chapters of each repertoire in order, each with its trunk', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Sicilienne', color: 'black' });
    const sozin = await createChapter(db, 'u1', rep.id, { name: 'Sozin' });
    const alapin = await createChapter(db, 'u1', rep.id, { name: 'Alapin' });
    await saveLine(db, 'u1', alapin.id, ['e2e4', 'c7c5', 'c2c3']);
    expect([sozin.position, alapin.position]).toEqual([0, 1]);
    await reorderChapters(db, 'u1', rep.id, [alapin.id, sozin.id]);
    const [listed] = await listRepertoires(db, 'u1');
    expect(listed).toMatchObject({ name: 'Sicilienne', color: 'black', active: true });
    expect(listed!.chapters.map((c) => [c.name, c.moves, c.trunk])).toEqual([
      ['Alapin', 3, ['e4', 'c5', 'c3']],
      ['Sozin', 0, []],
    ]);
    await expect(reorderChapters(db, 'u1', rep.id, [alapin.id])).rejects.toMatchObject({ statusCode: 400 });
  });

  it('moves a chapter to another repertoire of its colour only, at its end', async () => {
    const scandinave = await chapterOf('u1', 'Scandinave', 'white');
    const e4 = await createRepertoire(db, 'u1', { name: '1.e4', color: 'white' });
    await createChapter(db, 'u1', e4.id, { name: 'Caro-Kann' });
    const black = await createRepertoire(db, 'u1', { name: 'Noirs', color: 'black' });
    await expect(updateChapter(db, 'u1', scandinave.id, { repertoireId: black.id })).rejects.toMatchObject({ statusCode: 400 });
    expect(await updateChapter(db, 'u1', scandinave.id, { repertoireId: e4.id })).toMatchObject({ repertoireId: e4.id, position: 1 });
    const reps = await listRepertoires(db, 'u1');
    expect(reps.map((r) => [r.name, r.chapters.map((c) => c.name)])).toEqual([
      ['Scandinave', []],
      ['1.e4', ['Caro-Kann', 'Scandinave']],
      ['Noirs', []],
    ]);
  });

  it('deletes a chapter, or a repertoire with its chapters and their moves', async () => {
    const rep = await createRepertoire(db, 'u1', { name: '1.e4', color: 'white' });
    const a = await createChapter(db, 'u1', rep.id, { name: 'A' });
    const b = await createChapter(db, 'u1', rep.id, { name: 'B' });
    await saveLine(db, 'u1', a.id, E4_E5);
    await saveLine(db, 'u1', b.id, E4_E5);
    await deleteChapter(db, 'u1', a.id);
    expect((await listRepertoires(db, 'u1'))[0]!.chapters.map((c) => c.name)).toEqual(['B']);
    await deleteRepertoire(db, 'u1', rep.id);
    expect(await listRepertoires(db, 'u1')).toEqual([]);
    expect(await chapterMovesAt(db, 'u1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual([]);
  });

  it('starts the lines of a chapter at its own position', async () => {
    // After 1. e4 c6 2. d4 d5: the chapter's lines start there.
    const startFen = 'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3';
    const rep = await createRepertoire(db, 'u1', { name: 'Caro-Kann', color: 'black' });
    const advance = await createChapter(db, 'u1', rep.id, { name: 'Avance', startFen });
    await expect(createChapter(db, 'u1', rep.id, { name: 'X', startFen: 'pas une position' })).rejects.toMatchObject({ statusCode: 400 });
    expect(await saveLine(db, 'u1', advance.id, ['e4e5', 'c8f5', 'g1f3'])).toEqual({ added: 3 });
    expect((await listRepertoires(db, 'u1'))[0]!.chapters[0]!.trunk).toEqual(['e5', 'Bf5', 'Nf3']);
    // Deleting 3... Bf5 prunes what follows it, from the chapter's start.
    const bf5 = (await getChapter(db, 'u1', advance.id)).moves.find((m) => m.san === 'Bf5')!;
    expect(await deleteMove(db, 'u1', advance.id, bf5.id)).toEqual({ ok: true, pruned: 1 });
    // A PGN starting there (FEN header) is reachable in this chapter.
    const pgn = `[FEN "${startFen}"]\n[SetUp "1"]\n\n3. Nc3 dxe4 *`;
    expect(await importPgn(db, 'u1', advance.id, pgn)).toMatchObject({ added: 2, unreachable: 0 });
  });

  it('gives a repertoire with all its chapters, merged into one graph for the analyses', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Sicilienne', color: 'black' });
    const a = await createChapter(db, 'u1', rep.id, { name: 'Alapin' });
    const b = await createChapter(db, 'u1', rep.id, { name: 'Ouverte' });
    await saveLine(db, 'u1', b.id, ['e2e4', 'c7c5', 'g1f3']);
    await saveLine(db, 'u1', a.id, ['e2e4', 'c7c5', 'c2c3']);
    const detail = await getRepertoire(db, 'u1', rep.id);
    expect(detail.chapters.map((c) => c.name)).toEqual(['Alapin', 'Ouverte']);
    // Moves in chapter order, each with its chapter.
    expect(detail.moves.map((m) => [m.chapterId === a.id ? 'A' : 'B', m.san])).toEqual([
      ['A', 'e4'], ['A', 'c5'], ['A', 'c3'], ['B', 'e4'], ['B', 'c5'], ['B', 'Nf3'],
    ]);
    const [graph] = await repertoireGraphs(db, 'u1');
    expect(graph!.moves.map((m) => m.san)).toEqual(['e4', 'c5', 'c3', 'Nf3']);
    // A paused chapter is left out, unless every chapter is paused.
    await updateChapter(db, 'u1', a.id, { active: false });
    expect((await repertoireGraphs(db, 'u1'))[0]!.moves.map((m) => m.san)).toEqual(['e4', 'c5', 'Nf3']);
    await updateChapter(db, 'u1', b.id, { active: false });
    expect((await repertoireGraphs(db, 'u1'))[0]).toMatchObject({ active: false });
    expect((await repertoireGraphs(db, 'u1'))[0]!.moves).toHaveLength(4);
  });

  it('creates the chapters of a study, each from its PGN and its start', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Caro-Kann', color: 'black' });
    const startFen = 'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 1';
    const done = await createChapters(db, 'u1', rep.id, [
      { name: 'Intro', pgn: '1. e4 c6 2. d4 d5 *', lichessChapterId: 'aaaaaaaa' },
      { name: 'Classique', pgn: `[FEN "${startFen}"]\n[SetUp "1"]\n\n1. Nc3 dxe4 *` },
      { name: 'Vide' },
    ]);
    expect(done.map((d) => [d.chapter.name, d.chapter.startFen, d.chapter.lichessChapterId, d.imported?.added ?? null])).toEqual([
      ['Intro', null, 'aaaaaaaa', 4],
      ['Classique', startFen, null, 2],
      ['Vide', null, null, null],
    ]);
    const [listed] = await listRepertoires(db, 'u1');
    // The thumbnail of the repertoire: from the initial position.
    expect(listed!.trunk).toEqual(['e4', 'c6', 'd4', 'd5']);
  });

  it('groups chapters into a repertoire, deleting the repertoires left empty', async () => {
    const scandinave = await chapterOf('u1', 'Scandinave', 'white');
    const caro = await chapterOf('u1', 'Caro-Kann', 'white');
    const e4 = await createRepertoire(db, 'u1', { name: '1.e4', color: 'white' });
    const keep = await createChapter(db, 'u1', caro.repertoireId, { name: 'Reste' });
    expect(await moveChapters(db, 'u1', [scandinave.id, caro.id], e4.id)).toEqual({ ok: true, deleted: [scandinave.repertoireId] });
    const reps = await listRepertoires(db, 'u1');
    expect(reps.map((r) => [r.name, r.chapters.map((c) => c.name)])).toEqual([
      ['Caro-Kann', ['Reste']],
      ['1.e4', ['Scandinave', 'Caro-Kann']],
    ]);
    expect(keep.repertoireId).toBe(caro.repertoireId);
  });
});
