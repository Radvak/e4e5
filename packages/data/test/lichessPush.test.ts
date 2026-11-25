import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStudyCache,
  createChapter,
  createRepertoire,
  getRepertoire,
  getStudy,
  planPush,
  PUBLIC_SOURCES,
  pushRepertoire,
  saveLine,
  StudyError,
  type Db,
} from '../src/index.js';
import * as schema from '../src/schema.js';
import { users } from '../src/schema.js';

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));
const SRC = { ...PUBLIC_SOURCES, lichessToken: 'token' };

let db: Db;
beforeEach(async () => {
  const client = createClient({ url: ':memory:' });
  const d = drizzle(client, { schema });
  await migrate(d, { migrationsFolder: MIGRATIONS });
  await d.insert(users).values({ id: 'u1', username: 'u1' });
  db = d;
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearStudyCache();
});

/** A Lichess with studies in memory, answering the official API's study requests. */
function fakeLichess() {
  const studies = new Map<string, { name: string; visibility: string; chapters: { id: string; name: string; orientation: string; moves: string }[] }>();
  const calls: string[] = [];
  let next = 0;
  const newId = () => `ID${String(++next).padStart(6, '0')}`;
  vi.stubGlobal('fetch', async (url: string, init: { method?: string; headers: Record<string, string>; body?: string } = { headers: {} }) => {
    const path = url.replace('https://lichess.org', '').split('?')[0]!;
    const method = init.method ?? 'GET';
    const form = Object.fromEntries(new URLSearchParams(init.body ?? ''));
    calls.push(`${method} ${path}`);
    if (init.headers.Authorization !== 'Bearer token') return new Response('', { status: 401 });
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    if (method === 'POST' && path === '/api/study') {
      const id = newId();
      studies.set(id, { name: form.name!, visibility: form.visibility!, chapters: [{ id: newId(), name: 'Chapter 1', orientation: 'white', moves: '' }] });
      return json({ id });
    }
    const m = path.match(/^\/api\/study\/(\w{8})(?:\/(\w{8}))?(\.pgn|\/import-pgn|\/moves)?$/);
    const study = m && studies.get(m[1]!);
    if (!m || !study) return new Response('', { status: 404 });
    const moves = (pgn: string) => pgn.replace(/^\[.*\]\s*$/gm, '').trim();
    if (method === 'GET' && m[3] === '.pgn') {
      const text = study.chapters
        .map((c) => `[StudyName "${study.name}"]\n[ChapterName "${c.name}"]\n[ChapterURL "https://lichess.org/study/${m[1]}/${c.id}"]\n[Orientation "${c.orientation}"]\n\n${c.moves || '*'}\n`)
        .join('\n\n');
      return new Response(text, { status: 200 });
    }
    if (method === 'POST' && m[3] === '/import-pgn') {
      const id = newId();
      study.chapters.push({ id, name: form.name!, orientation: form.orientation!, moves: moves(form.pgn!) });
      return json({ chapters: [{ id, name: form.name }], error: null });
    }
    const chapter = study.chapters.find((c) => c.id === m[2]);
    if (!chapter) return new Response('{"error":"no chapter"}', { status: 400 });
    if (method === 'POST' && m[3] === '/moves') {
      chapter.moves = moves(form.pgn!);
      return new Response(null, { status: 204 });
    }
    if (method === 'DELETE') {
      study.chapters = study.chapters.filter((c) => c !== chapter);
      return new Response(null, { status: 204 });
    }
    return new Response('', { status: 404 });
  });
  return { studies, calls };
}

describe('push to Lichess', () => {
  it('creates a private study with one chapter per chapter, then updates them', async () => {
    const lichess = fakeLichess();
    const rep = await createRepertoire(db, 'u1', { name: 'Sicilienne', color: 'black' });
    const alapin = await createChapter(db, 'u1', rep.id, { name: 'Alapin' });
    const open = await createChapter(db, 'u1', rep.id, { name: 'Ouverte' });
    await saveLine(db, 'u1', alapin.id, ['e2e4', 'c7c5', 'c2c3', 'd7d5']);
    await saveLine(db, 'u1', open.id, ['e2e4', 'c7c5', 'g1f3', 'd7d6']);

    expect((await planPush(db, 'u1', rep.id, null)).chapters.map((c) => [c.name, c.action, c.moves])).toEqual([
      ['Alapin', 'create', 4],
      ['Ouverte', 'create', 4],
    ]);
    const done = await pushRepertoire(db, 'u1', rep.id, SRC);
    expect(done).toMatchObject({ createdStudy: true, created: 2, updated: 0 });
    const study = lichess.studies.get(done.studyId)!;
    expect(study).toMatchObject({ name: 'Sicilienne', visibility: 'private' });
    // Its empty first chapter deleted; ours with their name and side.
    expect(study.chapters.map((c) => [c.name, c.orientation, c.moves])).toEqual([
      ['Alapin', 'black', '1. e4 c5 2. c3 d5 *'],
      ['Ouverte', 'black', '1. e4 c5 2. Nf3 d6 *'],
    ]);
    const linked = await getRepertoire(db, 'u1', rep.id);
    expect(linked.lichessStudyId).toBe(done.studyId);
    expect(linked.chapters.map((c) => c.lichessChapterId)).toEqual(study.chapters.map((c) => c.id));

    // On Lichess: a move added to Ouverte. In the app: Alapin goes on, a new chapter.
    study.chapters[1]!.moves = '1. e4 c5 2. Nf3 d6 3. d4 *';
    await saveLine(db, 'u1', alapin.id, ['e2e4', 'c7c5', 'c2c3', 'd7d5', 'e4d5']);
    await createChapter(db, 'u1', rep.id, { name: 'Grand Prix' });
    const plan = await planPush(db, 'u1', rep.id, await getStudy(SRC, done.studyId, true));
    expect(plan.chapters.map((c) => [c.name, c.action, c.lost])).toEqual([
      ['Alapin', 'update', 0],
      ['Ouverte', 'update', 1],
      ['Grand Prix', 'create', 0],
    ]);
    lichess.calls.length = 0;
    expect(await pushRepertoire(db, 'u1', rep.id, SRC)).toMatchObject({ createdStudy: false, updated: 2, created: 1 });
    expect(lichess.calls.filter((c) => c.startsWith('POST'))).toEqual([
      `POST /api/study/${done.studyId}/${study.chapters[0]!.id}/moves`,
      `POST /api/study/${done.studyId}/${study.chapters[1]!.id}/moves`,
      `POST /api/study/${done.studyId}/import-pgn`,
    ]);
    expect(study.chapters.map((c) => c.moves)).toEqual(['1. e4 c5 2. c3 d5 3. exd5 *', '1. e4 c5 2. Nf3 d6 *', '*']);
  });

  it('needs a Lichess token allowed to write', async () => {
    fakeLichess();
    const rep = await createRepertoire(db, 'u1', { name: 'Sicilienne', color: 'black' });
    await expect(pushRepertoire(db, 'u1', rep.id, PUBLIC_SOURCES)).rejects.toEqual(expect.any(StudyError));
    await expect(pushRepertoire(db, 'u1', rep.id, { ...PUBLIC_SOURCES, lichessToken: 'read-only' })).rejects.toMatchObject({ status: 403 });
  });
});
