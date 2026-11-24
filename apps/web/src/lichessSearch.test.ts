import { afterEach, describe, expect, it } from 'vitest';
import { canSearchLichess, searchLichessStudies, studyHint } from './lichessSearch';

/** The site's answer (JSON when asked), as seen through the prototype. */
const PAGE = {
  paginator: {
    currentPage: 2,
    nbPages: 1180,
    nbResults: 18865,
    currentPageResults: [
      { id: 'jtlLwUvh', name: 'Caro-Kann Defense', likes: 50999, updatedAt: 1733290608071, owner: { name: 'LeninPerez', id: 'leninperez' }, chapters: [], topics: ['Defenses'] },
    ],
  },
};

function stub(status = 200, body: unknown = PAGE) {
  const calls: { url: string; accept?: string }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, accept: (init?.headers as Record<string, string>)?.Accept });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetcher };
}

afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

describe('Lichess study search (device)', () => {
  it('searches all authors, most liked first', async () => {
    const { calls, fetcher } = stub();
    const page = await searchLichessStudies('caro kann', 2, fetcher);
    expect(calls).toEqual([{ url: 'https://lichess.org/study/search?q=caro+kann&order=popular&page=2', accept: 'application/json' }]);
    expect(page).toEqual({
      page: 2,
      nbPages: 1180,
      nbResults: 18865,
      studies: [{ id: 'jtlLwUvh', name: 'Caro-Kann Defense', likes: 50999, owner: 'LeninPerez', topics: ['Defenses'], updatedAt: 1733290608071 }],
    });
  });

  it('lists the most liked studies without a query', async () => {
    const { calls, fetcher } = stub();
    await searchLichessStudies('', 1, fetcher);
    expect(calls[0]!.url).toBe('https://lichess.org/study/all/popular?page=1');
  });

  it('says when Lichess refuses or limits', async () => {
    await expect(searchLichessStudies('caro', 1, stub(403, {}).fetcher)).rejects.toThrow('La recherche Lichess a répondu 403');
    await expect(searchLichessStudies('caro', 1, stub(429, {}).fetcher)).rejects.toThrow('réessayez dans une minute');
  });

  it('is offered in a native app only', () => {
    expect(canSearchLichess()).toBe(false);
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    expect(canSearchLichess()).toBe(true);
  });
});

describe('study hint (topics)', () => {
  it('marks the studies whose topics are about something else than openings', () => {
    expect(studyHint(['Endgame', 'Rook endgames'])).toBe('Finales');
    expect(studyHint(['Tactics'])).toBe('Tactique');
    expect(studyHint(['Middlegame plans'])).toBe('Milieu de jeu');
  });
  it('says nothing for opening studies, mixed ones or without topics', () => {
    expect(studyHint(['Defenses'])).toBeNull();
    expect(studyHint(['Sicilian Defense', 'Middlegame'])).toBeNull();
    expect(studyHint([])).toBeNull();
  });
});
