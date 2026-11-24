/**
 * Search of the public Lichess studies, from the device: all authors, most liked first.
 *
 * Lichess has no study search in its official API; only its site has one (/study/search,
 * /study/all/popular, JSON when asked). Those pages refuse servers (Cloudflare: 403 from Fly) and
 * are closed to other web pages (Lichess sends CORS headers on /api/ only), so they are asked
 * directly from the device, and only in a native app (Capacitor: its network calls are not bound
 * by CORS). In the browser, `canSearchLichess()` is false and the search is not offered.
 */

/** A study in Lichess's search (the site's fields used). */
export interface FoundStudy {
  id: string;
  name: string;
  likes: number;
  owner: string;
  topics: string[];
  updatedAt: number;
}

export interface FoundPage {
  page: number;
  nbPages: number;
  nbResults: number;
  studies: FoundStudy[];
}

interface SitePaginator {
  paginator: {
    currentPage: number;
    nbPages: number;
    nbResults: number;
    currentPageResults: { id: string; name: string; likes: number; owner?: { name: string }; topics?: string[]; updatedAt: number }[];
  };
}

/** Running as a native app (Capacitor), where the site's search can be asked. */
export function canSearchLichess(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** Lichess studies matching `q` (the most liked of all if empty), 16 per page. */
export async function searchLichessStudies(q: string, page: number, fetcher: typeof fetch = fetch): Promise<FoundPage> {
  const params = new URLSearchParams(q ? { q, order: 'popular', page: String(page) } : { page: String(page) });
  const url = `https://lichess.org/study/${q ? 'search' : 'all/popular'}?${params}`;
  let res: Response;
  try {
    res = await fetcher(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Lichess est injoignable');
  }
  if (res.status === 429) throw new Error('Lichess limite le nombre de requêtes : réessayez dans une minute');
  if (!res.ok) throw new Error(`La recherche Lichess a répondu ${res.status}`);
  const { paginator: p } = (await res.json()) as SitePaginator;
  return {
    page: p.currentPage,
    nbPages: p.nbPages,
    nbResults: p.nbResults,
    studies: p.currentPageResults.map((s) => ({ id: s.id, name: s.name, likes: s.likes, owner: s.owner?.name ?? '', topics: s.topics ?? [], updatedAt: s.updatedAt })),
  };
}

/** Topics that say what a study is about besides openings, and the label shown for each. */
const OTHER_TOPICS: [RegExp, string][] = [
  [/endgame|ending|finale/i, 'Finales'],
  [/tacti|puzzle|combinaison|checkmate|mate in|\bmats?\b|calcul/i, 'Tactique'],
  [/middlegame|milieu|strateg|structure|plan/i, 'Milieu de jeu'],
];
/** Topics of an opening study (Lichess's opening topics: names of openings, "Defenses"…). */
const OPENING_TOPIC = /opening|ouverture|defen[cs]e|défense|gambit|attack|attaque|variation|variante|system|système|repertoire|répertoire/i;

/**
 * What a study found by the search seems to be about besides openings, from its topics (free
 * tags of its author, often missing): "Finales", "Tactique" or "Milieu de jeu"; null if it looks
 * like an opening study or says nothing. A hint only: its chapters are sorted once it is opened.
 */
export function studyHint(topics: string[]): string | null {
  if (topics.some((t) => OPENING_TOPIC.test(t))) return null;
  for (const [re, label] of OTHER_TOPICS) if (topics.some((t) => re.test(t))) return label;
  return null;
}
