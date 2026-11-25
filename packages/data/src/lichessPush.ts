/**
 * Push of a repertoire to its Lichess study (app → Lichess), with the user's token (scope
 * study:write), through the official API only:
 * - a chapter linked to a chapter of the study: its moves replace that chapter's
 *   (POST /api/study/{id}/{chapterId}/moves; Lichess keeps the chapter's name and start);
 * - a chapter not linked (or whose chapter is gone from the study): a new chapter of the study
 *   (POST /api/study/{id}/import-pgn, one per request, with its name and side);
 * - a repertoire without a study: a new study (private by default), its empty first chapter
 *   deleted once ours are there.
 * Nothing is deleted on Lichess but that empty chapter; the chapters of the study the
 * repertoire does not have stay as they are. Lichess cannot rename a chapter through its API.
 */
import { pgnToMoves, Repertoire, repertoireToPgn, type Color } from '@e4e5/core';
import type { Db } from './db.js';
import type { GameSources } from './gameSources.js';
import { getStudy, StudyError, type StudyDetail } from './lichessStudies.js';
import { chapterRoot, getRepertoire, updateChapter, updateRepertoire } from './repertoires.js';
import { planSync } from './repertoireSync.js';

export type StudyVisibility = 'private' | 'unlisted' | 'public';

/** A study has 64 chapters at most. */
export const MAX_STUDY_CHAPTERS = 64;

/** A write on the lichess.org API (form body), in the queue if any; Lichess errors as StudyError. */
async function lichessSend(src: GameSources, method: 'POST' | 'DELETE', path: string, form?: Record<string, string>): Promise<string> {
  if (!src.lichessToken) throw new StudyError(401, 'Liez votre compte Lichess (Mon compte) pour écrire dans vos études');
  const queue = src.lichessQueue ?? (<T>(task: () => Promise<T>) => task());
  return queue(async () => {
    let res: Response;
    try {
      res = await fetch(`${src.lichessHost}${path}`, {
        method,
        headers: { ...src.headers, Authorization: `Bearer ${src.lichessToken}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: form ? new URLSearchParams(form).toString() : undefined,
      });
    } catch {
      throw new StudyError(502, 'Lichess est injoignable, réessayez plus tard');
    }
    if (res.status === 401 || res.status === 403) {
      throw new StudyError(403, 'Lichess refuse l’écriture : reliez votre compte Lichess pour l’autoriser (l’étude doit être à vous)');
    }
    if (res.status === 429) throw new StudyError(429, 'Lichess limite le nombre de requêtes : réessayez dans une minute');
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new StudyError(res.status === 404 ? 404 : 502, body.error ? `Lichess : ${body.error}` : `Lichess a répondu ${res.status}`);
    }
    return res.text();
  });
}

/** A new study of the user (and its empty first chapter); answers its id. */
async function createStudy(src: GameSources, name: string, visibility: StudyVisibility): Promise<string> {
  const text = await lichessSend(src, 'POST', '/api/study', {
    name: name.slice(0, 100).padEnd(2, '.'),
    visibility,
    computer: 'everyone',
    explorer: 'everyone',
    cloneable: 'everyone',
    shareable: 'everyone',
    chat: 'member',
  });
  return (JSON.parse(text) as { id: string }).id;
}

/** A new chapter of a study from a PGN (one game); answers its id. */
async function importChapter(src: GameSources, studyId: string, name: string, pgn: string, orientation: Color): Promise<string> {
  const text = await lichessSend(src, 'POST', `/api/study/${studyId}/import-pgn`, { pgn, name: name.slice(0, 100) || '?', orientation });
  const id = (JSON.parse(text) as { chapters?: { id: string }[] }).chapters?.[0]?.id;
  if (!id) throw new StudyError(502, 'Lichess n’a pas créé le chapitre');
  return id;
}

const setChapterMoves = (src: GameSources, studyId: string, chapterId: string, pgn: string) =>
  lichessSend(src, 'POST', `/api/study/${studyId}/${chapterId}/moves`, { pgn });

const deleteStudyChapter = (src: GameSources, studyId: string, chapterId: string) => lichessSend(src, 'DELETE', `/api/study/${studyId}/${chapterId}`);

type Detail = Awaited<ReturnType<typeof getRepertoire>>;
type ChapterOf = Detail['chapters'][number];

/** The PGN of a chapter as pushed (no "Transposition" comments: they would come back as comments). */
function chapterPgn(detail: Detail, chapter: ChapterOf): string {
  const graph = new Repertoire(detail.color, detail.moves.filter((m) => m.chapterId === chapter.id));
  return repertoireToPgn(graph, chapter.name, chapter.startFen ?? undefined, { transpositions: false });
}

/** What a push would do, chapter by chapter (`study`: the repertoire's study as on Lichess now, if any). */
export async function planPush(db: Db, userId: string, repertoireId: string, study: StudyDetail | null) {
  const detail = await getRepertoire(db, userId, repertoireId);
  const onLichess = new Map((study?.chapters ?? []).filter((c) => c.id).map((c) => [c.id!, c]));
  const chapters = detail.chapters.map((c) => {
    const there = c.lichessChapterId ? onLichess.get(c.lichessChapterId) : undefined;
    // Moves of the Lichess chapter the app does not have: replaced by the push, so lost there.
    let lost = 0;
    if (there) {
      const mine = detail.moves.filter((m) => m.chapterId === c.id).map((m) => ({ ...m, source: 'pgn' }));
      lost = planSync(detail.color, mine, there.pgn, 'hard', chapterRoot(c)).add.length;
    }
    return {
      chapterId: c.id,
      name: c.name,
      action: there ? ('update' as const) : ('create' as const),
      /** Its name on Lichess, when different (Lichess cannot rename it through its API). */
      lichessName: there && there.name !== c.name ? there.name : null,
      moves: detail.moves.filter((m) => m.chapterId === c.id).length,
      lost,
    };
  });
  const linked = new Set(detail.chapters.map((c) => c.lichessChapterId).filter(Boolean));
  const created = chapters.filter((c) => c.action === 'create').length;
  return {
    studyId: detail.lichessStudyId,
    studyName: study?.name ?? null,
    chapters,
    /** Chapters of the study the repertoire does not have: left as they are. */
    untouched: (study?.chapters ?? []).filter((c) => !c.id || !linked.has(c.id)).map((c) => c.name),
    /** More chapters than a study can have. */
    tooMany: (study?.chapters.length ?? 0) + created > MAX_STUDY_CHAPTERS || created > MAX_STUDY_CHAPTERS,
  };
}

/** Pushes a repertoire to its study (created if it has none); answers what was done. */
export async function pushRepertoire(db: Db, userId: string, repertoireId: string, src: GameSources, opts: { visibility?: StudyVisibility } = {}) {
  const detail = await getRepertoire(db, userId, repertoireId);
  let studyId = detail.lichessStudyId;
  let study: StudyDetail | null = null;
  let createdStudy = false;
  if (studyId) study = await getStudy(src, studyId, true);
  else {
    studyId = await createStudy(src, detail.name, opts.visibility ?? 'private');
    createdStudy = true;
    // Linked at once: a push failing halfway goes on in the same study next time.
    await updateRepertoire(db, userId, detail.id, { lichessStudyId: studyId });
  }
  const onLichess = new Set((study?.chapters ?? []).map((c) => c.id).filter(Boolean));
  let updated = 0;
  let created = 0;
  for (const c of detail.chapters) {
    const pgn = chapterPgn(detail, c);
    if (c.lichessChapterId && onLichess.has(c.lichessChapterId)) {
      await setChapterMoves(src, studyId, c.lichessChapterId, pgn);
      updated++;
    } else {
      const id = await importChapter(src, studyId, c.name, pgn, detail.color);
      await updateChapter(db, userId, c.id, { lichessChapterId: id });
      created++;
    }
  }
  // The empty chapter Lichess creates with a study.
  if (createdStudy) {
    const fresh = await getStudy(src, studyId, true);
    const ours = new Set((await getRepertoire(db, userId, detail.id)).chapters.map((c) => c.lichessChapterId));
    for (const c of fresh.chapters) {
      if (c.id && !ours.has(c.id) && pgnToMoves(c.pgn).moves.length === 0) await deleteStudyChapter(src, studyId, c.id);
    }
  }
  return { studyId, createdStudy, updated, created };
}
