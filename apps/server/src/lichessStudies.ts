/**
 * Lichess studies, to create a repertoire from one, through the official API only (the site's
 * study search and popular lists are behind Cloudflare and refuse servers, and are closed to
 * other web pages): the studies of a player, listed, and one study exported in PGN. Calls go
 * one at a time through the shared lichess.org queue; answers are kept a while for all users.
 */
import { pgnChapters, type Color, type PgnChapter } from '@tabiya/core';
import { env } from './env.js';
import { lichessApiQueue } from './lichess.js';

const UA = 'tabiya';

/** A study in a player's list (the API gives no likes, topics nor side). */
export interface StudyListItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
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

/** GET on the lichess.org API, in the shared queue; Lichess errors as StudyError. */
function lichessGet(path: string, accept: string, notFound: string, token?: string | null): Promise<string> {
  return lichessApiQueue(async () => {
    let res: Response;
    try {
      res = await fetch(`${env.lichessHost}${path}`, { headers: { Accept: accept, 'User-Agent': UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    } catch {
      throw new StudyError(502, 'Lichess est injoignable, réessayez plus tard');
    }
    if (res.status === 404) throw new StudyError(404, notFound);
    if (res.status === 429) throw new StudyError(429, 'Lichess limite le nombre de requêtes : réessayez dans une minute');
    if (res.status === 403) throw new StudyError(403, 'Lichess a refusé la requête (étude privée, ou accès bloqué)');
    if (!res.ok) throw new StudyError(502, `Lichess a répondu ${res.status}`);
    return res.text();
  });
}

/** Answers kept for all users (`ms`), the `max` last; failures are not kept (ask again later). */
function memo<T>(ms: number, max: number, load: (key: string) => Promise<T>) {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  const get = (key: string): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.value;
    const value = load(key);
    cache.delete(key);
    cache.set(key, { at: Date.now(), value });
    value.catch(() => cache.get(key)?.value === value && cache.delete(key));
    while (cache.size > max) cache.delete(cache.keys().next().value!);
    return value;
  };
  return { get, clear: () => cache.clear() };
}

/** The public studies of a player, most recently updated first (the known authors are asked by everyone). */
const byPlayer = memo(30 * 60_000, 200, async (username: string) => {
  const text = await lichessGet(`/api/study/by/${encodeURIComponent(username)}`, 'application/x-ndjson', 'Joueur Lichess introuvable');
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const s = JSON.parse(line) as StudyListItem;
      return { id: s.id, name: s.name, createdAt: s.createdAt, updatedAt: s.updatedAt };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
});

export const studiesBy = (username: string): Promise<StudyListItem[]> => byPlayer.get(username.toLowerCase());

/** A public study, chapter by chapter (each with its PGN, side and whether it joins the others). */
const studies = memo(60 * 60_000, 300, async (id: string): Promise<StudyDetail> => {
  const params = new URLSearchParams({ orientation: 'true', clocks: 'false', comments: 'true', variations: 'true' });
  const pgn = await lichessGet(`/api/study/${id}.pgn?${params}`, 'application/x-chess-pgn', 'Étude introuvable ou privée');
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
});

export const getStudy = (id: string): Promise<StudyDetail> => studies.get(id);

/** For tests: forget the answers kept. */
export function clearStudyCache() {
  byPlayer.clear();
  studies.clear();
}
