/**
 * Sync of a repertoire from its Lichess study, chapter by chapter (Lichess → app), keeping the
 * training progress. Each chapter of the app is matched to a chapter of the study by its Lichess
 * id, else by its name (a repertoire linked to a study for the first time). The plan says what
 * would change; applying it merges each chosen chapter (see planSync: moves added by hand are
 * kept, unless `hard`), adds the chosen new chapters and deletes the chosen chapters gone from the
 * study. Chapters linked to the study then follow its order, the others after them.
 */
import { asc, eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { createChapters, deleteChapter, ownRepertoire, reorderChapters, syncChapter, updateChapter, updateRepertoire } from './repertoires.js';
import { chapters } from './schema.js';

/** A chapter of the study (its Lichess id, name and PGN). */
export interface StudyChapterIn {
  id?: string;
  name: string;
  pgn: string;
}

export interface StudySyncChoices {
  /** Chapters of the app to update (merged with their chapter of the study). */
  update: string[];
  /** Chapters of the study to add (Lichess ids). */
  add: string[];
  /** Chapters of the app to delete (gone from the study). */
  remove: string[];
  /** The chapters updated become exactly their chapter of the study. */
  hard?: boolean;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/** The chapters of the repertoire matched with those of the study. */
async function match(db: Db, userId: string, repertoireId: string, study: StudyChapterIn[]) {
  const rep = await ownRepertoire(db, userId, repertoireId);
  const own = await db.select().from(chapters).where(eq(chapters.repertoireId, rep.id)).orderBy(asc(chapters.position), asc(chapters.createdAt));
  const byId = new Map(study.filter((c) => c.id).map((c) => [c.id!, c]));
  const taken = new Set<string>();
  const pairs: { chapter: (typeof own)[number]; source: StudyChapterIn }[] = [];
  const gone: (typeof own)[number][] = [];
  // By Lichess id first, then by name for the chapters not linked yet.
  for (const c of own) {
    const source = c.lichessChapterId ? byId.get(c.lichessChapterId) : undefined;
    if (source) {
      pairs.push({ chapter: c, source });
      taken.add(source.id!);
    } else if (c.lichessChapterId) gone.push(c);
  }
  for (const c of own) {
    if (c.lichessChapterId) continue;
    const source = study.find((s) => s.id && !taken.has(s.id) && norm(s.name) === norm(c.name));
    if (source) {
      pairs.push({ chapter: c, source });
      taken.add(source.id!);
    }
  }
  const fresh = study.filter((s) => s.id && !taken.has(s.id));
  return { rep, own, pairs, gone, fresh };
}

/** What a sync from the study would change, chapter by chapter. */
export async function planStudySync(db: Db, userId: string, repertoireId: string, study: StudyChapterIn[], opts: { hard?: boolean } = {}) {
  const { pairs, gone, fresh } = await match(db, userId, repertoireId, study);
  const matched = [];
  for (const { chapter, source } of pairs) {
    const plan = await syncChapter(db, userId, chapter.id, source.pgn, { dryRun: true, mode: opts.hard ? 'hard' : 'merge' });
    matched.push({
      chapterId: chapter.id,
      lichessChapterId: source.id!,
      name: chapter.name,
      lichessName: source.name,
      /** Linked by its name (not linked to the study yet). */
      byName: !chapter.lichessChapterId,
      added: plan.added,
      /** Moves removed: gone from the study, and what only followed them (moves added by hand too). */
      removed: plan.removed + plan.pruned,
      updated: plan.updated,
      unreachable: plan.unreachable,
      errors: plan.errors,
    });
  }
  return {
    matched,
    fresh: fresh.map((s) => ({ lichessChapterId: s.id!, name: s.name })),
    gone: gone.map((c) => ({ chapterId: c.id, name: c.name })),
  };
}

/** Applies the chosen changes of a sync from the study `studyId`; the repertoire is linked to it. */
export async function applyStudySync(db: Db, userId: string, repertoireId: string, studyId: string, study: StudyChapterIn[], choices: StudySyncChoices) {
  const { rep, pairs, gone, fresh } = await match(db, userId, repertoireId, study);
  let added = 0;
  let removed = 0;
  let updated = 0;
  for (const { chapter, source } of pairs) {
    if (!choices.update.includes(chapter.id)) continue;
    const r = await syncChapter(db, userId, chapter.id, source.pgn, { mode: choices.hard ? 'hard' : 'merge' });
    added += r.added;
    removed += r.removed + ('pruned' in r ? r.pruned : 0);
    updated += r.updated;
    await updateChapter(db, userId, chapter.id, { name: source.name, lichessChapterId: source.id! });
  }
  const toAdd = fresh.filter((s) => choices.add.includes(s.id!));
  const created = await createChapters(db, userId, rep.id, toAdd.map((s) => ({ name: s.name, pgn: s.pgn, lichessChapterId: s.id! })));
  for (const c of gone) {
    if (!choices.remove.includes(c.id)) continue;
    await deleteChapter(db, userId, c.id);
  }
  await updateRepertoire(db, userId, rep.id, { lichessStudyId: studyId });
  // The chapters of the study in its order, the others after them (in their order).
  const order = new Map(study.map((s, i) => [s.id, i]));
  const now = await db.select().from(chapters).where(eq(chapters.repertoireId, rep.id)).orderBy(asc(chapters.position), asc(chapters.createdAt));
  const rank = (c: (typeof now)[number]) => (c.lichessChapterId && order.has(c.lichessChapterId) ? order.get(c.lichessChapterId)! : study.length);
  const sorted = now.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i);
  if (sorted.length) await reorderChapters(db, userId, rep.id, sorted.map(({ c }) => c.id));
  return {
    added,
    removed,
    updated,
    chaptersAdded: created.length,
    chaptersRemoved: gone.filter((c) => choices.remove.includes(c.id)).length,
  };
}
