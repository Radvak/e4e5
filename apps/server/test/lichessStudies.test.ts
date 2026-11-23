import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearStudyCache, getStudy, getStudyPreview, searchStudies, StudyError } from '../src/lichessStudies.js';

/** Answers of Lichess, by path prefix (as seen through the prototype). */
function stubLichess(routes: Record<string, { status?: number; body: string }>) {
  const calls: { url: string; accept: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, accept: init.headers.Accept! });
    const path = url.replace('https://lichess.org', '');
    const hit = Object.entries(routes).find(([p]) => path.startsWith(p));
    return new Response(hit?.[1].body ?? 'not found', { status: hit ? (hit[1].status ?? 200) : 404 });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearStudyCache();
});

const PAGE = JSON.stringify({
  paginator: {
    currentPage: 1,
    maxPerPage: 16,
    nbResults: 18865,
    nbPages: 1180,
    currentPageResults: [
      { id: 'jtlLwUvh', name: 'Caro-Kann Defense', likes: 50999, updatedAt: 1733290608071, owner: { name: 'Someone', id: 'someone' }, chapters: [], topics: ['Defenses'], visibility: 'public' },
    ],
  },
});

const STUDY = `[Event "Caro-Kann: Intro"]
[StudyName "Caro-Kann \\"CK\\""]
[ChapterName "Intro"]
[ChapterURL "https://lichess.org/study/jtlLwUvh/ccJj8Q0b"]
[Orientation "black"]

1. e4 c6 2. d4 d5 *


[Event "Caro-Kann: Advance"]
[StudyName "Caro-Kann \\"CK\\""]
[ChapterName "Advance"]
[ChapterURL "https://lichess.org/study/jtlLwUvh/AbCd1234"]
[Orientation "black"]
[FEN "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 1"]
[SetUp "1"]

1. e5 Bf5 *
`;

describe('Lichess studies', () => {
  it('searches the public studies, most liked first', async () => {
    const calls = stubLichess({ '/study/search': { body: PAGE } });
    const page = await searchStudies('caro kann', 2);
    expect(calls[0]).toEqual({ url: 'https://lichess.org/study/search?q=caro+kann&order=popular&page=2', accept: 'application/json' });
    expect(page).toEqual({
      page: 1,
      nbPages: 1180,
      nbResults: 18865,
      studies: [{ id: 'jtlLwUvh', name: 'Caro-Kann Defense', likes: 50999, owner: 'Someone', topics: ['Defenses'], updatedAt: 1733290608071 }],
    });
  });

  it('lists the most liked studies without a query', async () => {
    const calls = stubLichess({ '/study/all/popular': { body: PAGE } });
    await searchStudies('', 1);
    expect(calls[0]!.url).toBe('https://lichess.org/study/all/popular?page=1');
  });

  it('exports a study chapter by chapter, with its side', async () => {
    const calls = stubLichess({ '/api/study/jtlLwUvh.pgn': { body: STUDY } });
    const study = await getStudy('jtlLwUvh');
    expect(calls[0]!.url).toContain('/api/study/jtlLwUvh.pgn?orientation=true');
    expect(study).toMatchObject({ id: 'jtlLwUvh', name: 'Caro-Kann "CK"', color: 'black' });
    expect(study.chapters.map(({ pgn: _, trunk: __, ...c }) => c)).toEqual([
      { id: 'ccJj8Q0b', name: 'Intro', orientation: 'black', joins: true, moves: 4, maxPly: 4 },
      { id: 'AbCd1234', name: 'Advance', orientation: 'black', joins: true, moves: 2, maxPly: 6 },
    ]);
  });

  it('says when a study is private or missing', async () => {
    stubLichess({});
    await expect(getStudy('zzzzzzzz')).rejects.toEqual(new StudyError(404, 'Étude introuvable ou privée'));
  });

  it('exports a study once for its card and its chapters (cache), and previews it', async () => {
    const calls = stubLichess({ '/api/study/jtlLwUvh.pgn': { body: STUDY } });
    const [preview] = await Promise.all([getStudyPreview('jtlLwUvh'), getStudy('jtlLwUvh')]);
    await getStudy('jtlLwUvh');
    expect(calls).toHaveLength(1);
    expect(preview).toMatchObject({ id: 'jtlLwUvh', color: 'black', chapters: 2, moves: 6, trunk: { sans: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'], branches: [] } });
  });

  it('does not keep a failed export', async () => {
    let calls = stubLichess({});
    await expect(getStudy('jtlLwUvh')).rejects.toBeInstanceOf(StudyError);
    calls = stubLichess({ '/api/study/jtlLwUvh.pgn': { body: STUDY } });
    await expect(getStudy('jtlLwUvh')).resolves.toMatchObject({ name: 'Caro-Kann "CK"' });
    expect(calls).toHaveLength(1);
  });
});
