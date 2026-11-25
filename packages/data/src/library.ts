/**
 * The library ("Bibliothèque"): Lichess studies kept on the device to read them move by move,
 * next to the app's own lessons. A study is copied when added (chapters as PGN, comments and
 * arrows kept); adding it again refreshes the copy.
 */
import { and, desc, eq } from 'drizzle-orm';
import { DataError, type Db } from './db.js';
import type { GameSources } from './gameSources.js';
import { getStudy } from './lichessStudies.js';
import { libraryStudies } from './schema.js';

export async function listLibraryStudies(db: Db, userId: string) {
  const rows = await db.select().from(libraryStudies).where(eq(libraryStudies.userId, userId)).orderBy(desc(libraryStudies.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, chapters: r.chapters.length, createdAt: r.createdAt }));
}

export async function getLibraryStudy(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(libraryStudies).where(and(eq(libraryStudies.userId, userId), eq(libraryStudies.id, id)));
  if (!row) throw new DataError(404, 'Étude introuvable dans la bibliothèque');
  return { id: row.id, name: row.name, color: row.color, chapters: row.chapters, createdAt: row.createdAt };
}

/** Fetches the study from Lichess and keeps (or refreshes) its copy in the library. */
export async function addLibraryStudy(db: Db, userId: string, sources: GameSources, studyId: string) {
  const study = await getStudy(sources, studyId);
  const chapters = study.chapters.map((c) => ({ name: c.name, orientation: c.orientation, pgn: c.pgn }));
  if (!chapters.length) throw new DataError(400, 'Cette étude n’a aucun chapitre');
  await db
    .insert(libraryStudies)
    .values({ userId, id: study.id, name: study.name, color: study.color, chapters })
    .onConflictDoUpdate({ target: [libraryStudies.userId, libraryStudies.id], set: { name: study.name, color: study.color, chapters } });
  return getLibraryStudy(db, userId, study.id);
}

export async function deleteLibraryStudy(db: Db, userId: string, id: string) {
  await db.delete(libraryStudies).where(and(eq(libraryStudies.userId, userId), eq(libraryStudies.id, id)));
  return { ok: true as const };
}
