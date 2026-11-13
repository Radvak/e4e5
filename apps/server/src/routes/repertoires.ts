import { randomUUID } from 'node:crypto';
import {
  pgnToMoves,
  playUci,
  playUciOn,
  positionFromFen,
  START_FEN,
  Repertoire,
  repertoireToPgn,
  type Color,
  type RepMove,
} from '@prepa-cahier/core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { repertoires, repMoves, type RepMoveRow } from '../db/schema.js';

const createBody = z.object({ name: z.string().trim().min(1).max(100), color: z.enum(['white', 'black']) });
const renameBody = z.object({ name: z.string().trim().min(1).max(100) });
const moveBody = z.object({ fromFen: z.string().min(10).max(120), uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/) });
const patchMoveBody = z.object({
  comment: z.string().max(2000).nullable().optional(),
  nags: z.array(z.number().int().min(1).max(255)).max(4).nullable().optional(),
  isMain: z.boolean().optional(),
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
    return db.select().from(repertoires).where(eq(repertoires.userId, req.user!.id)).orderBy(asc(repertoires.createdAt));
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
    return { ...rep, moves: await loadMoves(rep.id) };
  });

  app.patch<{ Params: Params }>('/api/repertoires/:id', async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const { name } = renameBody.parse(req.body);
    await db.update(repertoires).set({ name }).where(eq(repertoires.id, rep.id));
    return { ...rep, name };
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
    if (patch.isMain) {
      // Only one main line per position.
      await db
        .update(repMoves)
        .set({ isMain: false })
        .where(and(eq(repMoves.repertoireId, rep.id), eq(repMoves.fromFen, move.fromFen)));
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
  app.post<{ Params: Params }>('/api/repertoires/:id/import-pgn', { bodyLimit: 6_000_000 }, async (req, reply) => {
    const rep = await ownRepertoire(req, reply);
    if (!rep) return;
    const { pgn } = importBody.parse(req.body);
    const parsed = pgnToMoves(pgn);

    const existing = await loadMoves(rep.id);
    const graph = new Repertoire(rep.color, existing);
    const hadMoves = new Set(existing.map((m) => m.fromFen));
    const fresh: RepMove[] = [];
    let duplicates = 0;
    for (const m of parsed.moves) {
      // Keep existing main-line choices; imported main line only where the position is new.
      const move = { ...m, isMain: !!m.isMain && !hadMoves.has(m.fromFen) };
      if (graph.add(move)) fresh.push(move);
      else duplicates++;
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
