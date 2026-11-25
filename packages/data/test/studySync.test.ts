import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyStudySync,
  createChapter,
  createChapters,
  createRepertoire,
  getRepertoire,
  planStudySync,
  saveLine,
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
  await d.insert(users).values({ id: 'u1', username: 'u1' });
  db = d;
});

const V1 = [
  { id: 'aaaaaaaa', name: 'Alapin', pgn: '1. e4 c5 2. c3 Nf6 *' },
  { id: 'bbbbbbbb', name: 'Ouverte', pgn: '1. e4 c5 2. Nf3 d6 *' },
  { id: 'cccccccc', name: 'Grand Prix', pgn: '1. e4 c5 2. Nc3 Nc6 *' },
];
// On Lichess: Alapin changed (2... d5 instead of 2... Nf6), Ouverte renamed, Grand Prix deleted, a new chapter.
const V2 = [
  { id: 'dddddddd', name: 'Morra', pgn: '1. e4 c5 2. d4 cxd4 *' },
  { id: 'aaaaaaaa', name: 'Alapin', pgn: '1. e4 c5 2. c3 d5 *' },
  { id: 'bbbbbbbb', name: 'Sicilienne ouverte', pgn: '1. e4 c5 2. Nf3 d6 *' },
];

/** The chapters of a study as imported (core createChapters). */
const asNew = (list: typeof V1) => list.map((c) => ({ name: c.name, pgn: c.pgn, lichessChapterId: c.id }));

const sans = async (repId: string, chapterName: string) => {
  const rep = await getRepertoire(db, 'u1', repId);
  const c = rep.chapters.find((x) => x.name === chapterName)!;
  return rep.moves.filter((m) => m.chapterId === c.id).map((m) => m.san);
};

describe('sync from a Lichess study', () => {
  it('plans and applies the changes of the study, keeping the moves added by hand', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Sicilienne', color: 'black', lichessStudyId: 'study001' });
    const [alapin] = await createChapters(db, 'u1', rep.id, asNew(V1));
    // Added by hand in the app: kept by a merge.
    await saveLine(db, 'u1', alapin!.chapter.id, ['e2e4', 'c7c5', 'c2c3', 'g8f6', 'e4e5', 'f6d5']);

    const plan = await planStudySync(db, 'u1', rep.id, V2);
    expect(plan.matched.map((m) => [m.name, m.lichessName, m.added, m.removed])).toEqual([
      // 2... Nf6 removed, with 3. e5 Nd5 added by hand after it.
      ['Alapin', 'Alapin', 1, 3],
      ['Ouverte', 'Sicilienne ouverte', 0, 0],
    ]);
    expect(plan.fresh).toEqual([{ lichessChapterId: 'dddddddd', name: 'Morra' }]);
    expect(plan.gone.map((c) => c.name)).toEqual(['Grand Prix']);

    const ids = plan.matched.map((m) => m.chapterId);
    const result = await applyStudySync(db, 'u1', rep.id, 'study001', V2, { update: ids, add: ['dddddddd'], remove: plan.gone.map((c) => c.chapterId) });
    expect(result).toMatchObject({ added: 1, updated: 0, chaptersAdded: 1, chaptersRemoved: 1 });
    // Alapin: 2... Nf6 left the study; the moves added by hand after it go with it.
    expect(await sans(rep.id, 'Alapin')).toEqual(['e4', 'c5', 'c3', 'd5']);
    const after = await getRepertoire(db, 'u1', rep.id);
    // The order of the study.
    expect(after.chapters.map((c) => c.name)).toEqual(['Morra', 'Alapin', 'Sicilienne ouverte']);
    expect(after.lichessStudyId).toBe('study001');
  });

  it('keeps a move added by hand where its line is still in the study', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Sicilienne', color: 'black' });
    const [open] = await createChapters(db, 'u1', rep.id, asNew([V1[1]!]));
    await saveLine(db, 'u1', open!.chapter.id, ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4']);
    const plan = await planStudySync(db, 'u1', rep.id, [V1[1]!]);
    await applyStudySync(db, 'u1', rep.id, 'study001', [V1[1]!], { update: plan.matched.map((m) => m.chapterId), add: [], remove: [] });
    expect(await sans(rep.id, 'Ouverte')).toEqual(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4']);
    // Hard: exactly the study.
    await applyStudySync(db, 'u1', rep.id, 'study001', [V1[1]!], { update: plan.matched.map((m) => m.chapterId), add: [], remove: [], hard: true });
    expect(await sans(rep.id, 'Ouverte')).toEqual(['e4', 'c5', 'Nf3', 'd6']);
  });

  it('links a repertoire to a study by the names of its chapters', async () => {
    const rep = await createRepertoire(db, 'u1', { name: 'Sicilienne', color: 'black' });
    const local = await createChapter(db, 'u1', rep.id, { name: 'alapin' });
    await createChapter(db, 'u1', rep.id, { name: 'Mes idées' });
    const plan = await planStudySync(db, 'u1', rep.id, V1);
    expect(plan.matched.map((m) => [m.chapterId, m.byName, m.added])).toEqual([[local.id, true, 4]]);
    expect(plan.fresh.map((c) => c.name)).toEqual(['Ouverte', 'Grand Prix']);
    await applyStudySync(db, 'u1', rep.id, 'study001', V1, { update: [local.id], add: [], remove: [] });
    const after = await getRepertoire(db, 'u1', rep.id);
    expect(after.chapters.map((c) => [c.name, c.lichessChapterId])).toEqual([
      ['Alapin', 'aaaaaaaa'],
      ['Mes idées', null],
    ]);
    // Linked now: found by its id, even renamed in the app.
    expect((await planStudySync(db, 'u1', rep.id, V1)).matched.map((m) => [m.byName, m.added])).toEqual([[false, 0]]);
  });
});
