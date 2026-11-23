/**
 * Public Lichess studies, to create a repertoire from one: browse them (the site's study lists,
 * which answer JSON when asked: most liked first) and export one in PGN (official API).
 * No token: public studies only.
 */
import { pgnChapters, pgnToMoves, trunkOf, type Color, type PgnChapter, type Thumbnail } from '@tabiya/core';
import { env } from './env.js';

const UA = 'tabiya';

export interface StudySummary {
  id: string;
  name: string;
  likes: number;
  owner: string;
  topics: string[];
  updatedAt: number;
}

export interface StudyPage {
  page: number;
  nbPages: number;
  nbResults: number;
  studies: StudySummary[];
}

export interface StudyDetail {
  id: string;
  name: string;
  /** Most chapters are studied from this side (Orientation of the chapters; default white). */
  color: Color;
  chapters: (PgnChapter & { id?: string })[];
}

export class StudyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface SitePaginator {
  paginator: {
    currentPage: number;
    nbPages: number;
    nbResults: number;
    currentPageResults: { id: string; name: string; likes: number; owner?: { name: string }; topics?: string[]; updatedAt: number }[];
  };
}

async function lichessGet(path: string, accept: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${env.lichessHost}${path}`, { headers: { Accept: accept, 'User-Agent': UA } });
  } catch {
    throw new StudyError(502, 'Lichess est injoignable');
  }
  if (res.status === 429) throw new StudyError(429, 'Limite de Lichess atteinte, réessayez dans une minute');
  return res;
}

/** Public studies matching `q` (all of them if empty), most liked first, 16 per page. */
export async function searchStudies(q: string, page: number): Promise<StudyPage> {
  const params = new URLSearchParams({ page: String(page) });
  const path = q ? `/study/search?${new URLSearchParams({ q, order: 'popular' })}&${params}` : `/study/all/popular?${params}`;
  const res = await lichessGet(path, 'application/json');
  if (!res.ok) throw new StudyError(502, `Lichess a répondu ${res.status}`);
  const { paginator: p } = (await res.json()) as SitePaginator;
  return {
    page: p.currentPage,
    nbPages: p.nbPages,
    nbResults: p.nbResults,
    studies: p.currentPageResults.map((s) => ({
      id: s.id,
      name: s.name,
      likes: s.likes,
      owner: s.owner?.name ?? '',
      topics: s.topics ?? [],
      updatedAt: s.updatedAt,
    })),
  };
}

/**
 * Studies exported recently, shared by all users (the popular ones are asked by everyone, for
 * their thumbnails): an hour, the 300 last at most. Exports are made one at a time, as Lichess
 * asks of API clients; a study already being exported is not asked twice.
 */
const CACHE_MS = 60 * 60_000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; study: Promise<StudyDetail> }>();
let queue: Promise<unknown> = Promise.resolve();

/** A public study, chapter by chapter (each with its PGN, side and whether it joins the others). */
export function getStudy(id: string): Promise<StudyDetail> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.study;
  const study = queue.then(() => exportStudy(id));
  queue = study.catch(() => undefined);
  cache.delete(id);
  cache.set(id, { at: Date.now(), study });
  // Failures are not kept (Lichess unreachable, rate limit: ask again later).
  study.catch(() => cache.get(id)?.study === study && cache.delete(id));
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return study;
}

/** For tests: forget the exported studies. */
export const clearStudyCache = () => cache.clear();

/** A study for its card in the catalogue: side, size, and its thumbnail (trunk of its chapters). */
export interface StudyPreview {
  id: string;
  color: Color;
  /** Chapters with moves that join the repertoire. */
  chapters: number;
  /** Distinct moves of these chapters. */
  moves: number;
  trunk: Thumbnail;
}

export async function getStudyPreview(id: string): Promise<StudyPreview> {
  const s = await getStudy(id);
  const used = s.chapters.filter((c) => c.joins && c.moves > 0);
  const moves = used.flatMap((c) => pgnToMoves(c.pgn).moves);
  return {
    id,
    color: s.color,
    chapters: used.length,
    moves: new Set(moves.map((m) => `${m.fromFen} ${m.uci}`)).size,
    trunk: trunkOf(moves),
  };
}

async function exportStudy(id: string): Promise<StudyDetail> {
  const params = new URLSearchParams({ orientation: 'true', clocks: 'false', comments: 'true', variations: 'true' });
  const res = await lichessGet(`/api/study/${id}.pgn?${params}`, 'application/x-chess-pgn');
  if (res.status === 404 || res.status === 403) throw new StudyError(404, 'Étude introuvable ou privée');
  if (!res.ok) throw new StudyError(502, `Lichess a répondu ${res.status}`);
  const pgn = await res.text();
  const chapters = pgnChapters(pgn);
  if (!chapters.length) throw new StudyError(404, 'Étude vide');
  // Chapter ids and the study's name, from the headers of the export.
  const urls = [...pgn.matchAll(/\[ChapterURL "[^"]*\/study\/[A-Za-z0-9]{8}\/([A-Za-z0-9]{8})"\]/g)].map((m) => m[1]!);
  const name = pgn.match(/\[StudyName "((?:[^"\\]|\\.)*)"\]/)?.[1]?.replace(/\\(.)/g, '$1') ?? chapters[0]!.name;
  const black = chapters.filter((c) => c.orientation === 'black').length;
  const white = chapters.filter((c) => c.orientation === 'white').length;
  return {
    id,
    name,
    color: black > white ? 'black' : 'white',
    chapters: chapters.map((c, i) => (urls.length === chapters.length ? { ...c, id: urls[i] } : c)),
  };
}
