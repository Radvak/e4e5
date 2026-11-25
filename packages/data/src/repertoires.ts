/**
 * Repertoires, their chapters and the moves of each chapter, for one user.
 *
 * A repertoire has a colour and chapters (like a Lichess study); each chapter is its own graph of
 * moves, starting from the initial position or from its `startFen`.
 */
import {
  fenKey,
  mergeChapterMoves,
  pgnToMoves,
  playUci,
  playUciOn,
  positionFromFen,
  START_FEN,
  Repertoire,
  trunkOf,
  type Color,
  type RepMove,
} from '@e4e5/core';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { DataError, newId, type Db } from './db.js';
import { planSync } from './repertoireSync.js';
import { chapters, graphColumns, repertoires, repMoves, type RepMoveRow } from './schema.js';

export type RepertoireRow = typeof repertoires.$inferSelect;
export type ChapterRow = typeof chapters.$inferSelect;
/** A chapter with the colour of its repertoire. */
export type OwnChapter = ChapterRow & { color: Color };

export interface RepertoirePatch {
  name?: string;
  lichessStudyId?: string | null;
}

export interface ChapterPatch {
  name?: string;
  /** false: paused (left out of "train all" and of the games analysis). */
  active?: boolean;
  /** Set by a sync tool to adopt an existing chapter (keeps its progress). */
  sourceKey?: string | null;
  lichessChapterId?: string | null;
  /** Moves the chapter to another repertoire of the same colour (at its end). */
  repertoireId?: string;
}

export interface MovePatch {
  comment?: string | null;
  nags?: number[] | null;
  isMain?: boolean;
  paused?: boolean;
}

/** SQLite's limit of bound parameters: rows are written in batches. */
const BATCH = 500;

/** Where the lines of a chapter start (fenKey). */
export const chapterRoot = (c: { startFen: string | null }): string => (c.startFen ? fenKey(positionFromFen(c.startFen)) : START_FEN);

/** The repertoire if it belongs to the user, else a 404. */
export async function ownRepertoire(db: Db, userId: string, id: string): Promise<RepertoireRow> {
  const [rep] = await db
    .select()
    .from(repertoires)
    .where(and(eq(repertoires.id, id), eq(repertoires.userId, userId)));
  if (!rep) throw new DataError(404, 'Répertoire introuvable');
  return rep;
}

const chapterColumns = {
  id: chapters.id,
  repertoireId: chapters.repertoireId,
  userId: chapters.userId,
  name: chapters.name,
  position: chapters.position,
  startFen: chapters.startFen,
  active: chapters.active,
  sourceKey: chapters.sourceKey,
  lichessChapterId: chapters.lichessChapterId,
  createdAt: chapters.createdAt,
  color: repertoires.color,
};

/** The chapter (with its repertoire's colour) if it belongs to the user, else a 404. */
export async function ownChapter(db: Db, userId: string, id: string): Promise<OwnChapter> {
  const [chapter] = await db
    .select(chapterColumns)
    .from(chapters)
    .innerJoin(repertoires, eq(chapters.repertoireId, repertoires.id))
    .where(and(eq(chapters.id, id), eq(chapters.userId, userId)));
  if (!chapter) throw new DataError(404, 'Chapitre introuvable');
  return chapter;
}

/** The user's chapters with their repertoire's colour and name, in the order of their repertoires. */
export async function userChapters(db: Db, userId: string) {
  return db
    .select({ ...chapterColumns, repertoireName: repertoires.name })
    .from(chapters)
    .innerJoin(repertoires, eq(chapters.repertoireId, repertoires.id))
    .where(eq(chapters.userId, userId))
    .orderBy(asc(repertoires.createdAt), asc(chapters.position), asc(chapters.createdAt));
}

export async function loadMoves(db: Db, chapterId: string): Promise<RepMoveRow[]> {
  return db.select().from(repMoves).where(eq(repMoves.chapterId, chapterId)).orderBy(asc(repMoves.id));
}

async function deleteMoves(db: Db, ids: number[]) {
  for (let i = 0; i < ids.length; i += BATCH) await db.delete(repMoves).where(inArray(repMoves.id, ids.slice(i, i + BATCH)));
}

/** Deletes the moves of a chapter no longer reachable from its start. */
async function pruneOrphans(db: Db, chapter: OwnChapter): Promise<number> {
  const rows = await loadMoves(db, chapter.id);
  const orphans = new Repertoire(chapter.color, rows).unreachableMoves(chapterRoot(chapter)) as RepMoveRow[];
  await deleteMoves(db, orphans.map((m) => m.id));
  return orphans.length;
}

/** The trunk of some moves (thumbnail: the moves from the start while there is only one). */
function thumbnail(moves: Parameters<typeof trunkOf>[0], start: string) {
  const t = trunkOf(moves, start);
  return { trunkFen: t.fen, trunk: t.sans, branches: t.branches };
}

/** The moves of the user's chapters needed for the thumbnails, per chapter. */
async function trunkMoves(db: Db, userId: string) {
  const moves = await db
    .select({ chapterId: repMoves.chapterId, fromFen: repMoves.fromFen, toFen: repMoves.toFen, san: repMoves.san, uci: repMoves.uci })
    .from(repMoves)
    .innerJoin(chapters, eq(repMoves.chapterId, chapters.id))
    .where(eq(chapters.userId, userId));
  const byChapter = new Map<string, typeof moves>();
  for (const m of moves) {
    const list = byChapter.get(m.chapterId);
    if (list) list.push(m);
    else byChapter.set(m.chapterId, [m]);
  }
  return byChapter;
}

/**
 * The user's repertoires, each with its chapters in order (each with its trunk and number of
 * moves). A repertoire is active while one of its chapters is.
 */
export async function listRepertoires(db: Db, userId: string) {
  const reps = await db.select().from(repertoires).where(eq(repertoires.userId, userId)).orderBy(asc(repertoires.createdAt));
  const list = await userChapters(db, userId);
  const moves = await trunkMoves(db, userId);
  return reps.map((r) => {
    const own = list
      .filter((c) => c.repertoireId === r.id)
      .map(({ repertoireName: _, color: __, ...c }) => ({ ...c, moves: moves.get(c.id)?.length ?? 0, ...thumbnail(moves.get(c.id) ?? [], chapterRoot(c)) }));
    // The thumbnail of the whole repertoire: its chapters from the initial position.
    const all = own.filter((c) => !c.startFen).flatMap((c) => moves.get(c.id) ?? []);
    return { ...r, active: own.some((c) => c.active), ...thumbnail(all, START_FEN), chapters: own };
  });
}

/**
 * A repertoire with its chapters (in order) and the moves of all of them, each with its chapter:
 * only what the web app uses, without empty fields (a big repertoire is several MB otherwise).
 */
export async function getRepertoire(db: Db, userId: string, id: string) {
  const rep = await ownRepertoire(db, userId, id);
  const own = await db.select().from(chapters).where(eq(chapters.repertoireId, rep.id)).orderBy(asc(chapters.position), asc(chapters.createdAt));
  const rows = own.length
    ? await db.select().from(repMoves).where(inArray(repMoves.chapterId, own.map((c) => c.id))).orderBy(asc(repMoves.id))
    : [];
  // In chapter order, so that merging them (core mergeChapterMoves) follows it.
  const order = new Map(own.map((c, i) => [c.id, i]));
  rows.sort((a, b) => order.get(a.chapterId)! - order.get(b.chapterId)! || a.id - b.id);
  const moves = rows.map((m) => ({
    id: m.id,
    chapterId: m.chapterId,
    fromFen: m.fromFen,
    toFen: m.toFen,
    uci: m.uci,
    san: m.san,
    isMain: m.isMain,
    source: m.source,
    ...(m.comment ? { comment: m.comment } : {}),
    ...(m.nags?.length ? { nags: m.nags } : {}),
    ...(m.paused ? { paused: true } : {}),
  }));
  const chapterList = own.map(({ userId: _, ...c }) => c);
  return { ...rep, active: own.some((c) => c.active), chapters: chapterList, moves };
}

/**
 * Each repertoire of the user as one graph (its chapters merged, core mergeChapterMoves), for the
 * gap finder and the games analysis: the active chapters, or all of them in a paused repertoire.
 */
export async function repertoireGraphs(db: Db, userId: string) {
  const reps = await db.select().from(repertoires).where(eq(repertoires.userId, userId)).orderBy(asc(repertoires.createdAt));
  const own = await db
    .select({ id: chapters.id, repertoireId: chapters.repertoireId, active: chapters.active })
    .from(chapters)
    .where(eq(chapters.userId, userId))
    .orderBy(asc(chapters.position), asc(chapters.createdAt));
  const moves = own.length ? await db.select(graphColumns).from(repMoves).where(inArray(repMoves.chapterId, own.map((c) => c.id))) : [];
  const byChapter = new Map<string, typeof moves>();
  for (const m of moves) (byChapter.get(m.chapterId) ?? byChapter.set(m.chapterId, []).get(m.chapterId)!).push(m);
  return reps.map((r) => {
    const mine = own.filter((c) => c.repertoireId === r.id);
    const active = mine.some((c) => c.active);
    const used = active ? mine.filter((c) => c.active) : mine;
    return { id: r.id, name: r.name, color: r.color, active, moves: mergeChapterMoves(used.flatMap((c) => byChapter.get(c.id) ?? [])) };
  });
}

export async function createRepertoire(db: Db, userId: string, body: { name: string; color: Color; lichessStudyId?: string | null }) {
  const row = { id: newId(), userId, lichessStudyId: null, ...body, createdAt: new Date() };
  await db.insert(repertoires).values(row);
  return row;
}

/** A new chapter, at the end of its repertoire. */
export async function createChapter(
  db: Db,
  userId: string,
  repertoireId: string,
  body: { name: string; startFen?: string | null; sourceKey?: string | null; lichessChapterId?: string | null },
): Promise<OwnChapter> {
  const rep = await ownRepertoire(db, userId, repertoireId);
  if (body.startFen) {
    try {
      positionFromFen(body.startFen);
    } catch {
      throw new DataError(400, 'FEN invalide');
    }
  }
  const row = {
    id: newId(),
    repertoireId: rep.id,
    userId,
    name: body.name,
    position: await nextPosition(db, rep.id),
    startFen: body.startFen ?? null,
    active: true,
    sourceKey: body.sourceKey ?? null,
    lichessChapterId: body.lichessChapterId ?? null,
    createdAt: new Date(),
  };
  await db.insert(chapters).values(row);
  return { ...row, color: rep.color };
}

/** A chapter to create from a PGN (a chapter of a Lichess study). */
export interface NewChapter {
  name: string;
  /** Its moves; a FEN header makes it start there. */
  pgn?: string;
  lichessChapterId?: string | null;
}

/** The FEN a PGN starts from (FEN header), null for the initial position. */
function pgnStart(pgn: string): string | null {
  const fen = pgn.match(/\[FEN "([^"]+)"\]/)?.[1];
  if (!fen) return null;
  try {
    return fenKey(positionFromFen(fen)) === START_FEN ? null : fen;
  } catch {
    return null;
  }
}

/** Creates chapters at the end of a repertoire, each with the moves of its PGN; answers what each import did. */
export async function createChapters(db: Db, userId: string, repertoireId: string, list: NewChapter[]) {
  const done = [];
  for (const c of list) {
    const chapter = await createChapter(db, userId, repertoireId, { name: c.name, startFen: c.pgn ? pgnStart(c.pgn) : null, lichessChapterId: c.lichessChapterId ?? null });
    const imported = c.pgn ? await importPgn(db, userId, chapter.id, c.pgn) : null;
    done.push({ chapter, imported });
  }
  return done;
}

async function nextPosition(db: Db, repertoireId: string): Promise<number> {
  const [last] = await db
    .select({ n: sql<number | null>`max(${chapters.position})` })
    .from(chapters)
    .where(eq(chapters.repertoireId, repertoireId));
  return last?.n === null || last?.n === undefined ? 0 : Number(last.n) + 1;
}

/** A chapter with its moves: only what the web app uses, without empty fields (a big chapter is several MB otherwise). */
export async function getChapter(db: Db, userId: string, id: string) {
  const chapter = await ownChapter(db, userId, id);
  const moves = (await loadMoves(db, chapter.id)).map((m) => ({
    id: m.id,
    fromFen: m.fromFen,
    toFen: m.toFen,
    uci: m.uci,
    san: m.san,
    isMain: m.isMain,
    source: m.source,
    ...(m.comment ? { comment: m.comment } : {}),
    ...(m.nags?.length ? { nags: m.nags } : {}),
    ...(m.paused ? { paused: true } : {}),
  }));
  return { ...chapter, moves };
}

export async function updateRepertoire(db: Db, userId: string, id: string, patch: RepertoirePatch) {
  const rep = await ownRepertoire(db, userId, id);
  if (Object.keys(patch).length) await db.update(repertoires).set(patch).where(eq(repertoires.id, rep.id));
  return { ...rep, ...patch };
}

export async function updateChapter(db: Db, userId: string, id: string, patch: ChapterPatch): Promise<OwnChapter> {
  const chapter = await ownChapter(db, userId, id);
  const { repertoireId, ...rest } = patch;
  const set: Partial<ChapterRow> = { ...rest };
  if (repertoireId !== undefined && repertoireId !== chapter.repertoireId) {
    const target = await ownRepertoire(db, userId, repertoireId);
    if (target.color !== chapter.color) throw new DataError(400, 'Le répertoire n’a pas la même couleur que le chapitre');
    set.repertoireId = target.id;
    set.position = await nextPosition(db, target.id);
  }
  if (Object.keys(set).length) await db.update(chapters).set(set).where(eq(chapters.id, chapter.id));
  return { ...chapter, ...set };
}

/**
 * Moves chapters to another repertoire of their colour (at its end, in this order). The
 * repertoires they leave empty are deleted (answers their ids).
 */
export async function moveChapters(db: Db, userId: string, ids: string[], repertoireId: string) {
  const sources = new Set<string>();
  for (const id of ids) {
    const before = await ownChapter(db, userId, id);
    await updateChapter(db, userId, id, { repertoireId });
    if (before.repertoireId !== repertoireId) sources.add(before.repertoireId);
  }
  const deleted: string[] = [];
  for (const id of sources) {
    if ((await db.$count(chapters, eq(chapters.repertoireId, id))) === 0) {
      await deleteRepertoire(db, userId, id);
      deleted.push(id);
    }
  }
  return { ok: true as const, deleted };
}

/** Puts the chapters of a repertoire in this order (every chapter of the repertoire, once). */
export async function reorderChapters(db: Db, userId: string, repertoireId: string, ids: string[]) {
  const rep = await ownRepertoire(db, userId, repertoireId);
  const have = await db.select({ id: chapters.id }).from(chapters).where(eq(chapters.repertoireId, rep.id));
  const same = have.length === ids.length && new Set(ids).size === ids.length && have.every((c) => ids.includes(c.id));
  if (!same) throw new DataError(400, 'Ordre des chapitres incomplet');
  for (const [position, id] of ids.entries()) await db.update(chapters).set({ position }).where(eq(chapters.id, id));
  return { ok: true as const };
}

/** Deletes a repertoire with its chapters and their moves. */
export async function deleteRepertoire(db: Db, userId: string, id: string) {
  const rep = await ownRepertoire(db, userId, id);
  const own = await db.select({ id: chapters.id }).from(chapters).where(eq(chapters.repertoireId, rep.id));
  for (const c of own) await db.delete(repMoves).where(eq(repMoves.chapterId, c.id));
  await db.delete(chapters).where(eq(chapters.repertoireId, rep.id));
  await db.delete(repertoires).where(eq(repertoires.id, rep.id));
  return { ok: true as const };
}

/** Deletes a chapter and its moves (its repertoire stays, even without chapters). */
export async function deleteChapter(db: Db, userId: string, id: string) {
  const chapter = await ownChapter(db, userId, id);
  await db.delete(repMoves).where(eq(repMoves.chapterId, chapter.id));
  await db.delete(chapters).where(eq(chapters.id, chapter.id));
  return { ok: true as const };
}

/** Adds one move to a chapter (validated and normalised). */
export async function addMove(db: Db, userId: string, chapterId: string, fromFen: string, uci: string) {
  const chapter = await ownChapter(db, userId, chapterId);
  let played;
  try {
    played = playUci(fromFen, uci);
  } catch {
    played = null;
  }
  if (!played) throw new DataError(400, 'Coup illégal');
  const siblings = await db
    .select({ id: repMoves.id })
    .from(repMoves)
    .where(and(eq(repMoves.chapterId, chapter.id), eq(repMoves.fromFen, played.fromFen)));
  const [row] = await db
    .insert(repMoves)
    .values({ chapterId: chapter.id, ...played, isMain: siblings.length === 0, source: 'manual' })
    .onConflictDoNothing()
    .returning();
  if (row) return { row, created: true };
  const [existing] = await db
    .select()
    .from(repMoves)
    .where(and(eq(repMoves.chapterId, chapter.id), eq(repMoves.fromFen, played.fromFen), eq(repMoves.uci, played.uci)));
  return { row: existing!, created: false };
}

/**
 * Saves a variation: every move of the line (from the chapter's start) that is not in the
 * chapter yet is added. A new move is the main line only where the position had no move.
 */
export async function saveLine(db: Db, userId: string, chapterId: string, ucis: string[]) {
  const chapter = await ownChapter(db, userId, chapterId);
  const pos = positionFromFen(chapter.startFen ?? START_FEN);
  const played = [];
  for (const uci of ucis) {
    const move = playUciOn(pos, uci);
    if (!move) throw new DataError(400, `Coup illégal ${uci} au demi-coup ${played.length + 1}`);
    played.push(move);
  }
  const graph = new Repertoire(chapter.color, await loadMoves(db, chapter.id));
  const rows = [];
  for (const m of played) {
    if (graph.has(m.fromFen, m.uci)) continue;
    const isMain = graph.movesAt(m.fromFen).length === 0;
    graph.add(m);
    rows.push({ ...m, chapterId: chapter.id, isMain, source: 'manual' as const });
  }
  if (rows.length) await db.insert(repMoves).values(rows).onConflictDoNothing();
  return { added: rows.length };
}

export async function updateMove(db: Db, userId: string, chapterId: string, moveId: number, patch: MovePatch) {
  const chapter = await ownChapter(db, userId, chapterId);
  patch = { ...patch };
  const where = and(eq(repMoves.id, moveId), eq(repMoves.chapterId, chapter.id));
  const [move] = await db.select().from(repMoves).where(where);
  if (!move) throw new DataError(404, 'Coup introuvable');
  const samePosition = and(eq(repMoves.chapterId, chapter.id), eq(repMoves.fromFen, move.fromFen));
  // The main move is never paused: making a move main resumes it, pausing it hands the main
  // line to the first other move still trained in the position.
  if (patch.isMain) {
    patch.paused = false;
    // Only one main line per position.
    await db.update(repMoves).set({ isMain: false }).where(samePosition);
  } else if (patch.paused) {
    patch.isMain = false;
    if (move.isMain) {
      const [heir] = await db
        .select({ id: repMoves.id })
        .from(repMoves)
        .where(and(samePosition, eq(repMoves.paused, false), ne(repMoves.id, move.id)))
        .orderBy(asc(repMoves.id))
        .limit(1);
      if (heir) await db.update(repMoves).set({ isMain: true }).where(eq(repMoves.id, heir.id));
    }
  }
  const [updated] = await db.update(repMoves).set(patch).where(where).returning();
  return updated!;
}

/** Deletes a move and everything of the chapter that is only reachable through it. */
export async function deleteMove(db: Db, userId: string, chapterId: string, moveId: number) {
  const chapter = await ownChapter(db, userId, chapterId);
  await db.delete(repMoves).where(and(eq(repMoves.id, moveId), eq(repMoves.chapterId, chapter.id)));
  const pruned = await pruneOrphans(db, chapter);
  return { ok: true as const, pruned };
}

/**
 * Sync of a chapter from a source (a Lichess chapter, a PGN): merges the PGN into the chapter,
 * keeping the training progress (see planSync). dryRun: only answers what would change. Mode
 * "hard": the chapter becomes exactly the source (moves added by hand removed too).
 */
export async function syncChapter(db: Db, userId: string, chapterId: string, pgn: string, opts: { dryRun?: boolean; mode?: 'merge' | 'hard' }) {
  const chapter = await ownChapter(db, userId, chapterId);
  const existing = await loadMoves(db, chapter.id);
  const plan = planSync(chapter.color, existing, pgn, opts.mode ?? 'merge', chapterRoot(chapter));
  const summary = {
    added: plan.add.length,
    removed: plan.remove.length,
    updated: plan.update.length,
    unreachable: plan.unreachable,
    errors: plan.errors.slice(0, 20),
  };
  if (opts.dryRun) {
    // The moves of the chapter left without a way from its start once the others are removed.
    const removed = new Set(plan.remove.map((m) => m.id));
    const kept = existing.filter((m) => !removed.has(m.id));
    const after = new Repertoire(chapter.color, [...kept, ...plan.add]);
    const orphans = new Set(after.unreachableMoves(chapterRoot(chapter)));
    return { ...summary, pruned: kept.filter((m) => orphans.has(m)).length, dryRun: true as const };
  }
  await deleteMoves(db, plan.remove.map((m) => m.id));
  for (const u of plan.update) {
    const { id: moveId, ...patch } = u;
    await db.update(repMoves).set(patch).where(and(eq(repMoves.id, moveId), eq(repMoves.chapterId, chapter.id)));
  }
  for (let i = 0; i < plan.add.length; i += BATCH) {
    await db
      .insert(repMoves)
      .values(plan.add.slice(i, i + BATCH).map((m) => ({ ...m, isMain: !!m.isMain, comment: m.comment ?? null, nags: m.nags ?? null, chapterId: chapter.id, source: 'pgn' as const })))
      .onConflictDoNothing();
  }
  // Moves left without a way from the chapter's start (their parent line was removed).
  const pruned = await pruneOrphans(db, chapter);
  return { ...summary, pruned };
}

/** Merges a PGN (any number of games, variations included) into a chapter. */
export async function importPgn(db: Db, userId: string, chapterId: string, pgn: string) {
  const chapter = await ownChapter(db, userId, chapterId);
  const parsed = pgnToMoves(pgn);
  const existing = await loadMoves(db, chapter.id);
  const graph = new Repertoire(chapter.color, existing);
  // Positions that already have their moves: existing main-line choices are kept.
  const hadMoves = new Set(existing.map((m) => m.fromFen));
  /** Positions given a main move by this import: one per position, even across games. */
  const mainSet = new Set<string>();
  const fresh: RepMove[] = [];
  let duplicates = 0;
  for (const m of parsed.moves) {
    const isMain = !!m.isMain && !hadMoves.has(m.fromFen) && !mainSet.has(m.fromFen);
    const move = { ...m, isMain };
    if (graph.add(move)) {
      fresh.push(move);
      if (isMain) mainSet.add(m.fromFen);
    } else duplicates++;
  }
  const reachable = graph.reachable(chapterRoot(chapter));
  const toInsert = fresh.filter((m) => reachable.has(m.fromFen));
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db
      .insert(repMoves)
      .values(toInsert.slice(i, i + BATCH).map((m) => ({ ...m, isMain: !!m.isMain, chapterId: chapter.id, source: 'pgn' as const })))
      .onConflictDoNothing();
  }
  return {
    games: parsed.games,
    added: toInsert.length,
    duplicates,
    unreachable: fresh.length - toInsert.length,
    errors: parsed.errors.slice(0, 50),
  };
}

/** The position of a FEN as stored in the moves (core fenKey), else a 400. */
function positionKey(fen: string): string {
  try {
    return fenKey(positionFromFen(fen));
  } catch {
    throw new DataError(400, 'FEN invalide');
  }
}

/** Moves prepared in this position in any of the user's chapters (both colours). */
export async function chapterMovesAt(db: Db, userId: string, fen: string) {
  const key = positionKey(fen);
  return db
    .select({
      chapterId: chapters.id,
      chapterName: chapters.name,
      repertoireId: repertoires.id,
      repertoireName: repertoires.name,
      color: repertoires.color,
      id: repMoves.id,
      paused: repMoves.paused,
      uci: repMoves.uci,
      san: repMoves.san,
      isMain: repMoves.isMain,
      comment: repMoves.comment,
      nags: repMoves.nags,
    })
    .from(repMoves)
    .innerJoin(chapters, eq(repMoves.chapterId, chapters.id))
    .innerJoin(repertoires, eq(chapters.repertoireId, repertoires.id))
    .where(and(eq(chapters.userId, userId), eq(repMoves.fromFen, key)));
}

/**
 * The chapters containing this position (reached by one of their moves, or with moves from it:
 * their start), with the number of their moves from here (0: end of their line).
 */
export async function positionChapters(db: Db, userId: string, fen: string) {
  const key = positionKey(fen);
  const rows = await db
    .select({
      chapterId: chapters.id,
      chapterName: chapters.name,
      repertoireId: repertoires.id,
      repertoireName: repertoires.name,
      color: repertoires.color,
      moves: sql<number>`sum(case when ${repMoves.fromFen} = ${key} then 1 else 0 end)`,
    })
    .from(repMoves)
    .innerJoin(chapters, eq(repMoves.chapterId, chapters.id))
    .innerJoin(repertoires, eq(chapters.repertoireId, repertoires.id))
    .where(and(eq(chapters.userId, userId), or(eq(repMoves.fromFen, key), eq(repMoves.toFen, key))))
    .groupBy(chapters.id)
    .orderBy(repertoires.name, chapters.position);
  return rows.map((r) => ({ ...r, moves: Number(r.moves) }));
}
