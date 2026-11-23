import { randomUUID } from 'node:crypto';
import {
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
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { repertoires, repMoves, type RepMoveRow } from '../db/schema.js';
import { planSync } from '../repertoireSync.js';

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.enum(['white', 'black']),
  /** Set by the sync tool (tools/sync): where the repertoire comes from. */
  sourceKey: z.string().trim().min(1).max(200).optional(),
});
const patchBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  /** false: paused (left out of "train all" and of the games analysis). */
  active: z.boolean().optional(),
  /** Set by the sync tool to adopt an existing repertoire (keeps its progress). */
  sourceKey: z.string().trim().min(1).max(200).optional(),
});
const moveBody = z.object({ fromFen: z.string().min(10).max(120), uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/) });
const patchMoveBody = z.object({
  comment: z.string().max(2000).nullable().optional(),
  nags: z.array(z.number().int().min(1).max(255)).max(4).nullable().optional(),
  isMain: z.boolean().optional(),
  paused: z.boolean().optional(),
});
const importBody = z.object({ pgn: z.string().min(1).max(5_000_000) });
const lineBody = z.object({
  /** The variation from the initial position, in UCI. */
  ucis: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).min(1).max(300),
});

type Params = { id: string };
type MoveParams = { id: string; moveId: string };

/** The repertoire if it belongs to the logged-in user, else replies 404. */
async function ownRepertoire(req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
  const [rep] = await db
    .select()
    .from(repertoires)
    .where(and(eq(repertoires.id, req.params.id), eq(repertoires.userId, req.user!.id)));
  if (!rep) reply.code(404).send({ error: 'Répertoire introuvable' });
  return rep;
}

async function loadMoves(repertoireId: string): Promise<RepMoveRow[]> {
  return db.select().from(repMoves).where(eq(repMoves.repertoireId, repertoireId)).orderBy(asc(repMoves.id));
}

/** Deletes moves no longer reachable from the initial position. */
async function pruneOrphans(repertoireId: string, color: Color) {
  const rows = await loadMoves(repertoireId);
  const orphans = new Repertoire(color, rows).unreachableMoves() as RepMoveRow[];
  const ids = orphans.map((m) => m.id);
  for (let i = 0; i < ids.length; i += 500) {
    await db.delete(repMoves).where(inArray(repMoves.id, ids.slice(i, i + 500)));
  }
  return ids.length;
}

export async function repertoireRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/api/repertoires', async (req) => {
    const reps = await db.select().from(repertoires).where(eq(repertoires.userId, req.user!.id)).orderBy(asc(repertoires.createdAt));
    // The trunk of each repertoire (for its thumbnail): the moves from the start while there is only one.
    const moves = await db
      .select({ repertoireId: repMoves.repertoireId, fromFen: repMoves.fromFen, toFen: repMoves.toFen, san: repMoves.san, uci: repMoves.uci })
      .from(repMoves)
      .innerJoin(repertoires, eq(repMoves.repertoireId, repertoires.id))
      .where(eq(repertoires.userId, req.user!.id));
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
  });

  app.post('/api/repertoires', async (req, reply) => {
    const body = createBody.parse(req.body);
    const row = { id: randomUUID(), userId: req.user!.id, ...body };
    await db.insert(repertoires).values(row);
    return reply.code(201).send(row);
  });

  app.get<{ Params: Params }>('/api/repertoires/:id', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    // Only what the web app uses, without empty fields (a big repertoire is several MB otherwise).
    const moves = (await loadMoves(rep.id)).map((m) => ({
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
  });

  app.patch<{ Params: Params }>('/api/repertoires/:id', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const patch = patchBody.parse(req.body);
    if (Object.keys(patch).length) await db.update(repertoires).set(patch).where(eq(repertoires.id, rep.id));
    return { ...rep, ...patch };
  });

  app.delete<{ Params: Params }>('/api/repertoires/:id', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    await db.delete(repMoves).where(eq(repMoves.repertoireId, rep.id));
    await db.delete(repertoires).where(eq(repertoires.id, rep.id));
    return { ok: true };
  });

  /** Adds one move (validated and normalised server-side). */
  app.post<{ Params: Params }>('/api/repertoires/:id/moves', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const { fromFen, uci } = moveBody.parse(req.body);
    let played;
    try {
      played = playUci(fromFen, uci);
    } catch {
      played = null;
    }
    if (!played) return reply.code(400).send({ error: 'Coup illégal' });
    const siblings = await db
      .select({ id: repMoves.id })
      .from(repMoves)
      .where(and(eq(repMoves.repertoireId, rep.id), eq(repMoves.fromFen, played.fromFen)));
    const [row] = await db
      .insert(repMoves)
      .values({ repertoireId: rep.id, ...played, isMain: siblings.length === 0, source: 'manual' })
      .onConflictDoNothing()
      .returning();
    if (row) return reply.code(201).send(row);
    const [existing] = await db
      .select()
      .from(repMoves)
      .where(and(eq(repMoves.repertoireId, rep.id), eq(repMoves.fromFen, played.fromFen), eq(repMoves.uci, played.uci)));
    return existing;
  });

  /**
   * Saves a variation: every move of the line (from the initial position) that is not in the
   * repertoire yet is added. A new move is the main line only where the position had no move.
   */
  app.post<{ Params: Params }>('/api/repertoires/:id/lines', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const { ucis } = lineBody.parse(req.body);
    const pos = positionFromFen(START_FEN);
    const played = [];
    for (const uci of ucis) {
      const move = playUciOn(pos, uci);
      if (!move) return reply.code(400).send({ error: `Coup illégal ${uci} au demi-coup ${played.length + 1}` });
      played.push(move);
    }
    const graph = new Repertoire(rep.color, await loadMoves(rep.id));
    const rows = [];
    for (const m of played) {
      if (graph.has(m.fromFen, m.uci)) continue;
      const isMain = graph.movesAt(m.fromFen).length === 0;
      graph.add(m);
      rows.push({ ...m, repertoireId: rep.id, isMain, source: 'manual' as const });
    }
    if (rows.length) await db.insert(repMoves).values(rows).onConflictDoNothing();
    return { added: rows.length };
  });

  app.patch<{ Params: MoveParams }>('/api/repertoires/:id/moves/:moveId', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const patch = patchMoveBody.parse(req.body);
    const where = and(eq(repMoves.id, Number(req.params.moveId)), eq(repMoves.repertoireId, rep.id));
    const [move] = await db.select().from(repMoves).where(where);
    if (!move) return reply.code(404).send({ error: 'Coup introuvable' });
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
    return updated;
  });

  /** Deletes a move and everything that is only reachable through it. */
  app.delete<{ Params: MoveParams }>('/api/repertoires/:id/moves/:moveId', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    await db
      .delete(repMoves)
      .where(and(eq(repMoves.id, Number(req.params.moveId)), eq(repMoves.repertoireId, rep.id)));
    const pruned = await pruneOrphans(rep.id, rep.color);
    return { ok: true, pruned };
  });

  /** Merges a PGN (any number of games, variations included) into the repertoire. */
  /**
   * Sync from a source (tools/sync): merges the PGN into the repertoire, keeping the training
   * progress (see planSync). ?dryRun=1: only answers what would change. ?mode=hard: the
   * repertoire becomes exactly the source (moves added by hand removed too).
   */
  app.put<{ Params: Params; Querystring: { dryRun?: string; mode?: string } }>('/api/repertoires/:id/sync', { bodyLimit: 12_000_000 }, async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const { pgn } = z.object({ pgn: z.string().min(1).max(10_000_000) }).parse(req.body);
    const plan = planSync(rep.color, await loadMoves(rep.id), pgn, req.query.mode === 'hard' ? 'hard' : 'merge');
    const summary = {
      added: plan.add.length,
      removed: plan.remove.length,
      updated: plan.update.length,
      unreachable: plan.unreachable,
      errors: plan.errors.slice(0, 20),
    };
    if (req.query.dryRun) return { ...summary, dryRun: true };
    const ids = plan.remove.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 500) await db.delete(repMoves).where(inArray(repMoves.id, ids.slice(i, i + 500)));
    for (const u of plan.update) {
      const { id, ...patch } = u;
      await db.update(repMoves).set(patch).where(and(eq(repMoves.id, id), eq(repMoves.repertoireId, rep.id)));
    }
    for (let i = 0; i < plan.add.length; i += 500) {
      await db
        .insert(repMoves)
        .values(plan.add.slice(i, i + 500).map((m) => ({ ...m, isMain: !!m.isMain, comment: m.comment ?? null, nags: m.nags ?? null, repertoireId: rep.id, source: 'pgn' as const })))
        .onConflictDoNothing();
    }
    // Moves left without a way from the initial position (their parent line was removed).
    const pruned = await pruneOrphans(rep.id, rep.color);
    return { ...summary, pruned };
  });

  app.post<{ Params: Params }>('/api/repertoires/:id/import-pgn', { bodyLimit: 6_000_000 }, async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const { pgn } = importBody.parse(req.body);
    const parsed = pgnToMoves(pgn);

    const existing = await loadMoves(rep.id);
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
    for (let i = 0; i < toInsert.length; i += 500) {
      await db
        .insert(repMoves)
        .values(toInsert.slice(i, i + 500).map((m) => ({ ...m, isMain: !!m.isMain, repertoireId: rep.id, source: 'pgn' as const })))
        .onConflictDoNothing();
    }
    return {
      games: parsed.games,
      added: toInsert.length,
      duplicates,
      unreachable: fresh.length - toInsert.length,
      errors: parsed.errors.slice(0, 50),
    };
  });

  app.get<{ Params: Params }>('/api/repertoires/:id/pgn', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const pgn = repertoireToPgn(new Repertoire(rep.color, await loadMoves(rep.id)), rep.name);
    const filename = rep.name.replace(/[^\w-]+/g, '_') || 'repertoire';
    return reply
      .header('Content-Type', 'application/x-chess-pgn; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}.pgn"`)
      .send(pgn);
  });
}
