/**
 * Repertoires and their moves, for one user. Shared by the server (routes/repertoires.ts) and the
 * app running without a server: same queries, same rules.
 */
import {
  fenKey,
  pgnToMoves,
  playUci,
  playUciOn,
  positionFromFen,
  START_FEN,
  Repertoire,
  repertoireToPgn,
  trunkOf,
  type Color,
  type RepMove,
} from '@tabiya/core';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { DataError, newId, type Db } from './db.js';
import { planSync } from './repertoireSync.js';
import { repertoires, repMoves, type RepMoveRow } from './schema.js';

export type RepertoireRow = typeof repertoires.$inferSelect;

export interface RepertoirePatch {
  name?: string;
  /** false: paused (left out of "train all" and of the games analysis). */
  active?: boolean;
  /** Set by the sync tool to adopt an existing repertoire (keeps its progress). */
  sourceKey?: string;
}

export interface MovePatch {
  comment?: string | null;
  nags?: number[] | null;
  isMain?: boolean;
  paused?: boolean;
}

/** SQLite's limit of bound parameters: rows are written in batches. */
const BATCH = 500;

/** The repertoire if it belongs to the user, else a 404. */
export async function ownRepertoire(db: Db, userId: string, id: string): Promise<RepertoireRow> {
  const [rep] = await db
    .select()
    .from(repertoires)
    .where(and(eq(repertoires.id, id), eq(repertoires.userId, userId)));
  if (!rep) throw new DataError(404, 'Répertoire introuvable');
  return rep;
}

export async function loadMoves(db: Db, repertoireId: string): Promise<RepMoveRow[]> {
  return db.select().from(repMoves).where(eq(repMoves.repertoireId, repertoireId)).orderBy(asc(repMoves.id));
}

/** Deletes moves no longer reachable from the initial position. */
async function pruneOrphans(db: Db, repertoireId: string, color: Color): Promise<number> {
  const rows = await loadMoves(db, repertoireId);
  const orphans = new Repertoire(color, rows).unreachableMoves() as RepMoveRow[];
  const ids = orphans.map((m) => m.id);
  for (let i = 0; i < ids.length; i += BATCH) {
    await db.delete(repMoves).where(inArray(repMoves.id, ids.slice(i, i + BATCH)));
  }
  return ids.length;
}

/** The user's repertoires, each with its trunk (thumbnail: the moves from the start while there is only one). */
export async function listRepertoires(db: Db, userId: string) {
  const reps = await db.select().from(repertoires).where(eq(repertoires.userId, userId)).orderBy(asc(repertoires.createdAt));
  const moves = await db
    .select({ repertoireId: repMoves.repertoireId, fromFen: repMoves.fromFen, toFen: repMoves.toFen, san: repMoves.san, uci: repMoves.uci })
    .from(repMoves)
    .innerJoin(repertoires, eq(repMoves.repertoireId, repertoires.id))
    .where(eq(repertoires.userId, userId));
  const byRep = new Map<string, typeof moves>();
  for (const m of moves) {
    const list = byRep.get(m.repertoireId);
    if (list) list.push(m);
    else byRep.set(m.repertoireId, [m]);
  }
  return reps.map((r) => {
    // The first moves of the variations, drawn as arrows.
    const t = trunkOf(byRep.get(r.id) ?? []);
    return { ...r, trunkFen: t.fen, trunk: t.sans, branches: t.branches };
  });
}

export async function createRepertoire(db: Db, userId: string, body: { name: string; color: Color; sourceKey?: string }) {
  const row = { id: newId(), userId, ...body };
  await db.insert(repertoires).values(row);
  return row;
}

/** A repertoire with its moves: only what the web app uses, without empty fields (a big repertoire is several MB otherwise). */
export async function getRepertoire(db: Db, userId: string, id: string) {
  const rep = await ownRepertoire(db, userId, id);
  const moves = (await loadMoves(db, rep.id)).map((m) => ({
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
  return { ...rep, moves };
}

export async function updateRepertoire(db: Db, userId: string, id: string, patch: RepertoirePatch) {
  const rep = await ownRepertoire(db, userId, id);
  if (Object.keys(patch).length) await db.update(repertoires).set(patch).where(eq(repertoires.id, rep.id));
  return { ...rep, ...patch };
}

export async function deleteRepertoire(db: Db, userId: string, id: string) {
  const rep = await ownRepertoire(db, userId, id);
  await db.delete(repMoves).where(eq(repMoves.repertoireId, rep.id));
  await db.delete(repertoires).where(eq(repertoires.id, rep.id));
  return { ok: true as const };
}

/** Adds one move (validated and normalised). */
export async function addMove(db: Db, userId: string, id: string, fromFen: string, uci: string) {
  const rep = await ownRepertoire(db, userId, id);
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
    .where(and(eq(repMoves.repertoireId, rep.id), eq(repMoves.fromFen, played.fromFen)));
  const [row] = await db
    .insert(repMoves)
    .values({ repertoireId: rep.id, ...played, isMain: siblings.length === 0, source: 'manual' })
    .onConflictDoNothing()
    .returning();
  if (row) return { row, created: true };
  const [existing] = await db
    .select()
    .from(repMoves)
    .where(and(eq(repMoves.repertoireId, rep.id), eq(repMoves.fromFen, played.fromFen), eq(repMoves.uci, played.uci)));
  return { row: existing!, created: false };
}

/**
 * Saves a variation: every move of the line (from the initial position) that is not in the
 * repertoire yet is added. A new move is the main line only where the position had no move.
 */
export async function saveLine(db: Db, userId: string, id: string, ucis: string[]) {
  const rep = await ownRepertoire(db, userId, id);
  const pos = positionFromFen(START_FEN);
  const played = [];
  for (const uci of ucis) {
    const move = playUciOn(pos, uci);
    if (!move) throw new DataError(400, `Coup illégal ${uci} au demi-coup ${played.length + 1}`);
    played.push(move);
  }
  const graph = new Repertoire(rep.color, await loadMoves(db, rep.id));
  const rows = [];
  for (const m of played) {
    if (graph.has(m.fromFen, m.uci)) continue;
    const isMain = graph.movesAt(m.fromFen).length === 0;
    graph.add(m);
    rows.push({ ...m, repertoireId: rep.id, isMain, source: 'manual' as const });
  }
  if (rows.length) await db.insert(repMoves).values(rows).onConflictDoNothing();
  return { added: rows.length };
}

export async function updateMove(db: Db, userId: string, id: string, moveId: number, patch: MovePatch) {
  const rep = await ownRepertoire(db, userId, id);
  patch = { ...patch };
  const where = and(eq(repMoves.id, moveId), eq(repMoves.repertoireId, rep.id));
  const [move] = await db.select().from(repMoves).where(where);
  if (!move) throw new DataError(404, 'Coup introuvable');
  const samePosition = and(eq(repMoves.repertoireId, rep.id), eq(repMoves.fromFen, move.fromFen));
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

/** Deletes a move and everything that is only reachable through it. */
export async function deleteMove(db: Db, userId: string, id: string, moveId: number) {
  const rep = await ownRepertoire(db, userId, id);
  await db.delete(repMoves).where(and(eq(repMoves.id, moveId), eq(repMoves.repertoireId, rep.id)));
  const pruned = await pruneOrphans(db, rep.id, rep.color);
  return { ok: true as const, pruned };
}

/**
 * Sync from a source (a sync tool outside this repository): merges the PGN into the repertoire, keeping the training
 * progress (see planSync). dryRun: only answers what would change. Mode "hard": the repertoire
 * becomes exactly the source (moves added by hand removed too).
 */
export async function syncRepertoire(db: Db, userId: string, id: string, pgn: string, opts: { dryRun?: boolean; mode?: 'merge' | 'hard' }) {
  const rep = await ownRepertoire(db, userId, id);
  const plan = planSync(rep.color, await loadMoves(db, rep.id), pgn, opts.mode ?? 'merge');
  const summary = {
    added: plan.add.length,
    removed: plan.remove.length,
    updated: plan.update.length,
    unreachable: plan.unreachable,
    errors: plan.errors.slice(0, 20),
  };
  if (opts.dryRun) return { ...summary, dryRun: true as const };
  const ids = plan.remove.map((m) => m.id);
  for (let i = 0; i < ids.length; i += BATCH) await db.delete(repMoves).where(inArray(repMoves.id, ids.slice(i, i + BATCH)));
  for (const u of plan.update) {
    const { id: moveId, ...patch } = u;
    await db.update(repMoves).set(patch).where(and(eq(repMoves.id, moveId), eq(repMoves.repertoireId, rep.id)));
  }
  for (let i = 0; i < plan.add.length; i += BATCH) {
    await db
      .insert(repMoves)
      .values(plan.add.slice(i, i + BATCH).map((m) => ({ ...m, isMain: !!m.isMain, comment: m.comment ?? null, nags: m.nags ?? null, repertoireId: rep.id, source: 'pgn' as const })))
      .onConflictDoNothing();
  }
  // Moves left without a way from the initial position (their parent line was removed).
  const pruned = await pruneOrphans(db, rep.id, rep.color);
  return { ...summary, pruned };
}

/** Merges a PGN (any number of games, variations included) into the repertoire. */
export async function importPgn(db: Db, userId: string, id: string, pgn: string) {
  const rep = await ownRepertoire(db, userId, id);
  const parsed = pgnToMoves(pgn);
  const existing = await loadMoves(db, rep.id);
  const graph = new Repertoire(rep.color, existing);
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
  const reachable = graph.reachable();
  const toInsert = fresh.filter((m) => reachable.has(m.fromFen));
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db
      .insert(repMoves)
      .values(toInsert.slice(i, i + BATCH).map((m) => ({ ...m, isMain: !!m.isMain, repertoireId: rep.id, source: 'pgn' as const })))
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

/** The repertoire as PGN, with a file name made from its name. */
export async function exportPgn(db: Db, userId: string, id: string) {
  const rep = await ownRepertoire(db, userId, id);
  const pgn = repertoireToPgn(new Repertoire(rep.color, await loadMoves(db, rep.id)), rep.name);
  return { pgn, filename: rep.name.replace(/[^\w-]+/g, '_') || 'repertoire' };
}

/** The position of a FEN as stored in the moves (core fenKey), else a 400. */
function positionKey(fen: string): string {
  try {
    return fenKey(positionFromFen(fen));
  } catch {
    throw new DataError(400, 'FEN invalide');
  }
}

/** Moves prepared in this position in any of the user's repertoires (both colours). */
export async function repertoireMovesAt(db: Db, userId: string, fen: string) {
  const key = positionKey(fen);
  return db
    .select({
      repertoireId: repertoires.id,
      name: repertoires.name,
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
    .innerJoin(repertoires, eq(repMoves.repertoireId, repertoires.id))
    .where(and(eq(repertoires.userId, userId), eq(repMoves.fromFen, key)));
}

/**
 * The repertoires containing this position (reached by one of their moves, or with moves from
 * it: the initial position), with the number of their moves from here (0: end of their line).
 */
export async function positionRepertoires(db: Db, userId: string, fen: string) {
  const key = positionKey(fen);
  const rows = await db
    .select({
      repertoireId: repertoires.id,
      name: repertoires.name,
      color: repertoires.color,
      moves: sql<number>`sum(case when ${repMoves.fromFen} = ${key} then 1 else 0 end)`,
    })
    .from(repMoves)
    .innerJoin(repertoires, eq(repMoves.repertoireId, repertoires.id))
    .where(and(eq(repertoires.userId, userId), or(eq(repMoves.fromFen, key), eq(repMoves.toFen, key))))
    .groupBy(repertoires.id)
    .orderBy(repertoires.name);
  return rows.map((r) => ({ ...r, moves: Number(r.moves) }));
}
