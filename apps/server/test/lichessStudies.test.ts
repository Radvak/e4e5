import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearStudyCache, getStudy, StudyError, studiesBy } from '../src/lichessStudies.js';

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

// The official API's list of a player's studies (ndjson), as seen from production.
const BY_PLAYER = [
  { id: 'jsSks17H', name: 'Sicilian Defense', createdAt: 1611340981495, updatedAt: 1700000000000 },
  { id: 'jtlLwUvh', name: 'Caro-Kann Defense', createdAt: 1612369937607, updatedAt: 1733290608071 },
]
  .map((s) => JSON.stringify(s))
  .join('\n');

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
  it("lists a player's public studies, most recently updated first, once for everyone", async () => {
    const calls = stubLichess({ '/api/study/by/leninperez': { body: BY_PLAYER } });
    const list = await studiesBy('LeninPerez');
    await studiesBy('leninperez');
    expect(calls).toEqual([{ url: 'https://lichess.org/api/study/by/leninperez', accept: 'application/x-ndjson' }]);
    expect(list.map((s) => s.name)).toEqual(['Caro-Kann Defense', 'Sicilian Defense']);
  });

  it('says when a player does not exist, and when Lichess limits the requests', async () => {
    stubLichess({ '/api/study/by/busy': { status: 429, body: '{"error":"Please only run 1 request(s) at a time"}' } });
    await expect(studiesBy('nobody')).rejects.toEqual(new StudyError(404, 'Joueur Lichess introuvable'));
    await expect(studiesBy('busy')).rejects.toMatchObject({ status: 429 });
  });

  it('exports a study chapter by chapter, with its side', async () => {
    const calls = stubLichess({ '/api/study/jtlLwUvh.pgn': { body: STUDY } });
    const study = await getStudy('jtlLwUvh');
    expect(calls[0]!.url).toContain('/api/study/jtlLwUvh.pgn?orientation=true');
    expect(study).toMatchObject({ id: 'jtlLwUvh', name: 'Caro-Kann "CK"', color: 'black' });
    expect(study.chapters.map(({ pgn: _, trunk: __, ...c }) => c)).toEqual([
      { id: 'ccJj8Q0b', name: 'Intro', orientation: 'black', joins: true, kind: 'opening', moves: 4, maxPly: 4 },
      { id: 'AbCd1234', name: 'Advance', orientation: 'black', joins: true, kind: 'opening', moves: 2, maxPly: 6 },
    ]);
  });

  it('says when a study is private or missing', async () => {
    stubLichess({});
    await expect(getStudy('zzzzzzzz')).rejects.toEqual(new StudyError(404, 'Étude introuvable ou privée'));
  });

  it('exports a study once for everyone (cache), one request at a time', async () => {
    let running = 0;
    let most = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return new Response(url.includes('/api/study/') && url.includes('.pgn') ? STUDY : BY_PLAYER);
    });
    await Promise.all([getStudy('jtlLwUvh'), getStudy('jtlLwUvh'), studiesBy('someone'), getStudy('AbCd1234')]);
    expect(most).toBe(1);
  });

  it('does not keep a failed export', async () => {
    let calls = stubLichess({});
    await expect(getStudy('jtlLwUvh')).rejects.toBeInstanceOf(StudyError);
    calls = stubLichess({ '/api/study/jtlLwUvh.pgn': { body: STUDY } });
    await expect(getStudy('jtlLwUvh')).resolves.toMatchObject({ name: 'Caro-Kann "CK"' });
    expect(calls).toHaveLength(1);
  });
});
