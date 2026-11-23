/**
 * The API methods answered by the local database (no server), with the shared data functions
 * (@tabiya/data). Same answers as the server's, JSON included (dates as ISO strings), so the
 * pages see no difference. Only the repertoires for now: the other methods still go to the
 * server (see mode.ts).
 */
import {
  createRepertoire,
  DataError,
  deleteMove,
  deleteRepertoire,
  getRepertoire,
  importPgn,
  listRepertoires,
  saveLine,
  updateMove,
  updateRepertoire,
} from '@tabiya/data';
import { repertoires, repMoves } from '@tabiya/data/schema';
import { eq } from 'drizzle-orm';
import { ApiError, type api, type RepertoireDetail, type RepertoireSummary } from '../api';
import { LOCAL_USER, localDb } from './db';
import type { LocalMethod } from './mode';

type Api = typeof api;

/** Runs a data function on the local database, answering like the server would. */
async function run<T>(fn: (db: Awaited<ReturnType<typeof localDb>>['db']) => Promise<unknown>): Promise<T> {
  let result: unknown;
  try {
    result = await fn((await localDb()).db);
  } catch (e) {
    if (e instanceof DataError) throw new ApiError(e.statusCode, e.message);
    throw new ApiError(500, e instanceof Error ? e.message : String(e));
  }
  // Through JSON, as from the server: dates become strings, undefined fields disappear.
  return JSON.parse(JSON.stringify(result)) as T;
}

export const localApi = {
  repertoires: () => run(async (db) => listRepertoires(db, LOCAL_USER)),
  createRepertoire: (name, color) => run(async (db) => createRepertoire(db, LOCAL_USER, { name: name.trim(), color })),
  renameRepertoire: (id, name) => run(async (db) => updateRepertoire(db, LOCAL_USER, id, { name: name.trim() })),
  setRepertoireActive: (id, active) => run(async (db) => updateRepertoire(db, LOCAL_USER, id, { active })),
  deleteRepertoire: (id) => run(async (db) => deleteRepertoire(db, LOCAL_USER, id)),
  repertoire: (id) => run(async (db) => getRepertoire(db, LOCAL_USER, id)),
  saveLine: (id, ucis) => run(async (db) => saveLine(db, LOCAL_USER, id, ucis)),
  updateMove: (id, moveId, patch) => run(async (db) => updateMove(db, LOCAL_USER, id, moveId, patch)),
  deleteMove: (id, moveId) => run(async (db) => deleteMove(db, LOCAL_USER, id, moveId)),
  importPgn: (id, pgn) => run(async (db) => importPgn(db, LOCAL_USER, id, pgn)),
} satisfies Pick<Api, LocalMethod>;

/**
 * Replaces the local repertoires with a copy of the server's, same ids (the features still
 * answered by the server find them). Answers the number of repertoires and moves copied.
 */
export async function copyFromServer(remote: Pick<Api, 'repertoires' | 'repertoire'>): Promise<{ repertoires: number; moves: number }> {
  const list: RepertoireSummary[] = await remote.repertoires();
  const details: RepertoireDetail[] = [];
  for (const r of list) details.push(await remote.repertoire(r.id));
  const { db } = await localDb();
  const mine = await db.select({ id: repertoires.id }).from(repertoires).where(eq(repertoires.userId, LOCAL_USER));
  for (const r of mine) {
    await db.delete(repMoves).where(eq(repMoves.repertoireId, r.id));
    await db.delete(repertoires).where(eq(repertoires.id, r.id));
  }
  let moves = 0;
  for (const d of details) {
    await db.insert(repertoires).values({ id: d.id, userId: LOCAL_USER, name: d.name, color: d.color, active: d.active, createdAt: new Date(d.createdAt) });
    for (let i = 0; i < d.moves.length; i += 500) {
      await db.insert(repMoves).values(
        d.moves.slice(i, i + 500).map((m) => ({
          id: m.id,
          repertoireId: d.id,
          fromFen: m.fromFen,
          toFen: m.toFen,
          uci: m.uci,
          san: m.san,
          comment: m.comment ?? null,
          nags: m.nags?.length ? m.nags : null,
          isMain: !!m.isMain,
          paused: !!m.paused,
          source: m.source as 'manual' | 'pgn' | 'game' | 'explorer',
        })),
      );
    }
    moves += d.moves.length;
  }
  return { repertoires: details.length, moves };
}
