import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addLibraryStudy, clearStudyCache, DataError, deleteLibraryStudy, getLibraryStudy, listLibraryStudies, PUBLIC_SOURCES, type Db } from '../src/index.js';
import * as schema from '../src/schema.js';
import { users } from '../src/schema.js';

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));
let db: Db;

beforeEach(async () => {
  const d = drizzle(createClient({ url: ':memory:' }), { schema });
  await migrate(d, { migrationsFolder: MIGRATIONS });
  await d.insert(users).values([{ id: 'u1', username: 'u1' }, { id: 'u2', username: 'u2' }]);
  db = d as unknown as Db;
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearStudyCache();
});

const STUDY = `[Event "Openings: London"]
[StudyName "Openings"]
[ChapterName "London"]
[ChapterURL "https://lichess.org/study/AbCdEfGh/ch000001"]
[Orientation "white"]

1. d4 { [%cal Gd2d4] Centre. } 1... d5 2. Bf4 (2. c4 e6) 2... Nf6 *
`;

function stubStudy(body: string) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('/api/study/AbCdEfGh')) return new Response(body);
    return new Response('not found', { status: 404 });
  });
}

describe('library studies', () => {
  it('keeps a copy of a Lichess study, comments, arrows and variations included', async () => {
    stubStudy(STUDY);
    const added = await addLibraryStudy(db, 'u1', PUBLIC_SOURCES, 'AbCdEfGh');
    expect(added.name).toBe('Openings');
    expect(added.color).toBe('white');
    expect(added.chapters).toHaveLength(1);
    expect(added.chapters[0]!.name).toBe('London');
    expect(added.chapters[0]!.pgn).toContain('[%cal Gd2d4]');
    expect(added.chapters[0]!.pgn).toMatch(/\(\s*2\. c4 e6\s*\)/);
    expect(await listLibraryStudies(db, 'u1')).toMatchObject([{ id: 'AbCdEfGh', name: 'Openings', chapters: 1 }]);
    expect(await listLibraryStudies(db, 'u2')).toEqual([]);
  });

  it('refreshes the copy when added again, and deletes it', async () => {
    stubStudy(STUDY);
    await addLibraryStudy(db, 'u1', PUBLIC_SOURCES, 'AbCdEfGh');
    clearStudyCache();
    stubStudy(STUDY.replace('1... d5', '1... Nf6 2. c4'));
    await addLibraryStudy(db, 'u1', PUBLIC_SOURCES, 'AbCdEfGh');
    expect(await listLibraryStudies(db, 'u1')).toHaveLength(1);
    expect((await getLibraryStudy(db, 'u1', 'AbCdEfGh')).chapters[0]!.pgn).toContain('Nf6');
    await deleteLibraryStudy(db, 'u1', 'AbCdEfGh');
    await expect(getLibraryStudy(db, 'u1', 'AbCdEfGh')).rejects.toBeInstanceOf(DataError);
  });
});
