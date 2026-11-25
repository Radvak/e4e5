/**
 * Lichess studies, to create a repertoire from one, through the official API only (the site's
 * study search and popular lists are behind Cloudflare and refuse servers, and are closed to
 * other web pages): the studies of a player, listed, and one study exported in PGN. Shared by
 * the server (its addresses, User-Agent and lichess.org queue, see GameSources) and the app
 * without a server (the official API allows other web pages: CORS *). Answers are kept a while.
 *
 * With the user's Lichess token (scope study:read), Lichess also answers their private studies:
 * the answers are then kept apart, under that token.
 */
import { pgnChapters, type Color, type PgnChapter } from '@e4e5/core';
import type { GameSources } from './gameSources.js';

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

/** GET on the lichess.org API, in the queue if any; Lichess errors as StudyError. */
function lichessGet(src: GameSources, path: string, accept: string, notFound: string): Promise<string> {
  const queue = src.lichessQueue ?? (<T>(task: () => Promise<T>) => task());
  return queue(async () => {
    let res: Response;
    try {
      const auth: Record<string, string> = src.lichessToken ? { Authorization: `Bearer ${src.lichessToken}` } : {};
      res = await fetch(`${src.lichessHost}${path}`, { headers: { ...src.headers, Accept: accept, ...auth } });
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

/**
 * Answers kept (`ms`), the `max` last, per token (a token can see its owner's private studies);
 * failures are not kept (ask again later).
 */
function memo<T>(ms: number, max: number, load: (src: GameSources, key: string) => Promise<T>) {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  /** `fresh`: asked again, not from the answers kept (e.g. to sync after a change on Lichess). */
  const get = (src: GameSources, id: string, fresh = false): Promise<T> => {
    const key = `${src.lichessToken ?? ''}\n${id}`;
    const hit = cache.get(key);
    if (hit && !fresh && Date.now() - hit.at < ms) return hit.value;
    const value = load(src, id);
    cache.delete(key);
    cache.set(key, { at: Date.now(), value });
    value.catch(() => cache.get(key)?.value === value && cache.delete(key));
    while (cache.size > max) cache.delete(cache.keys().next().value!);
    return value;
  };
  return { get, clear: () => cache.clear() };
}

/**
 * The studies of a player, most recently updated first: the public ones, and the private ones too
 * when asked with the player's own token (scope study:read).
 */
const byPlayer = memo(30 * 60_000, 200, async (src, username) => {
  const text = await lichessGet(src, `/api/study/by/${encodeURIComponent(username)}`, 'application/x-ndjson', 'Joueur Lichess introuvable');
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const s = JSON.parse(line) as StudyListItem;
      return { id: s.id, name: s.name, createdAt: s.createdAt, updatedAt: s.updatedAt };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
});

export const studiesBy = (src: GameSources, username: string): Promise<StudyListItem[]> => byPlayer.get(src, username.toLowerCase());

/** A study (private: with its owner's token), chapter by chapter (each with its PGN, side and whether it joins the others). */
const studies = memo(60 * 60_000, 300, async (src, id): Promise<StudyDetail> => {
  const params = new URLSearchParams({ orientation: 'true', clocks: 'false', comments: 'true', variations: 'true' });
  const pgn = await lichessGet(src, `/api/study/${id}.pgn?${params}`, 'application/x-chess-pgn', 'Étude introuvable ou privée');
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

/** A study, chapter by chapter; `fresh`: asked to Lichess again (not the answer kept). */
export const getStudy = (src: GameSources, id: string, fresh = false): Promise<StudyDetail> => studies.get(src, id, fresh);

/** For tests: forget the answers kept. */
export function clearStudyCache() {
  byPlayer.clear();
  studies.clear();
}
