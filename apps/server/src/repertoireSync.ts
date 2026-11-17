/**
 * Merge of a source (PGN) into an existing repertoire, for the sync tool: the training progress
 * is kept (review cards are keyed by position, and the positions still there keep theirs).
 *
 * - moves of the source missing from the repertoire are added;
 * - moves imported earlier (source "pgn") that left the source are removed; moves added by
 *   hand in the editor or from games are never removed;
 * - comments and annotations follow the source when it has some;
 * - main moves: the user's choices are kept; where a position has no main move left, the
 *   source's main move becomes the main move.
 *
 * Mode "hard": the repertoire becomes exactly the source. Every move not in the source is
 * removed (added by hand or from games included), comments, annotations and main moves are the
 * source's. The progress of the positions still there is kept all the same.
 */
import { pgnToMoves, Repertoire, type Color, type RepMove } from '@tabiya/core';

export interface ExistingMove extends RepMove {
  id: number;
  source: string;
}

export interface SyncPlan {
  add: RepMove[];
  remove: ExistingMove[];
  /** Moves whose comment / annotations / main flag change. */
  update: { id: number; comment?: string | null; nags?: number[] | null; isMain?: boolean }[];
  errors: string[];
  unreachable: number;
}

const key = (m: { fromFen: string; uci: string }) => `${m.fromFen} ${m.uci}`;

export type SyncMode = 'merge' | 'hard';

export function planSync(color: Color, existing: ExistingMove[], pgn: string, mode: SyncMode = 'merge'): SyncPlan {
  const hard = mode === 'hard';
  const parsed = pgnToMoves(pgn);
  // The source as a graph (duplicates across games merged), only what is reachable.
  const target = new Repertoire(color, parsed.moves);
  const reachable = target.reachable();
  const wanted = new Map<string, RepMove>();
  for (const m of target.all()) if (reachable.has(m.fromFen)) wanted.set(key(m), m);
  const unreachable = target.size - wanted.size;

  const have = new Map(existing.map((m) => [key(m), m]));
  const add = [...wanted.values()].filter((m) => !have.has(key(m)));
  const remove = existing.filter((m) => (hard || m.source === 'pgn') && !wanted.has(key(m)));
  const removed = new Set(remove.map((m) => m.id));

  // Hard mode: one main move per position, the source's (first game first), else its first move.
  const mainOf = new Map<string, string>();
  for (const m of wanted.values()) if (m.isMain && !mainOf.has(m.fromFen)) mainOf.set(m.fromFen, m.uci);
  for (const m of wanted.values()) if (!mainOf.has(m.fromFen)) mainOf.set(m.fromFen, m.uci);
  const sourceMain = (m: { fromFen: string; uci: string }) => mainOf.get(m.fromFen) === m.uci;

  const update: SyncPlan['update'] = [];
  for (const m of existing) {
    const w = wanted.get(key(m));
    if (!w || removed.has(m.id)) continue;
    const patch: SyncPlan['update'][number] = { id: m.id };
    if (hard) {
      if ((w.comment ?? null) !== (m.comment ?? null)) patch.comment = w.comment ?? null;
      if (JSON.stringify(w.nags?.length ? w.nags : null) !== JSON.stringify(m.nags?.length ? m.nags : null)) patch.nags = w.nags?.length ? w.nags : null;
      if (sourceMain(m) !== !!m.isMain) patch.isMain = sourceMain(m);
    } else {
      if (w.comment && w.comment !== m.comment) patch.comment = w.comment;
      if (w.nags?.length && JSON.stringify(w.nags) !== JSON.stringify(m.nags ?? null)) patch.nags = w.nags;
    }
    if (Object.keys(patch).length > 1) update.push(patch);
  }

  // Main moves: positions left without one get the source's main move (or their first move).
  if (hard) {
    return { add: add.map((m) => ({ ...m, isMain: sourceMain(m) })), remove, update, errors: parsed.errors, unreachable };
  }
  const kept = existing.filter((m) => !removed.has(m.id));
  const mainAt = new Set(kept.filter((m) => m.isMain).map((m) => m.fromFen));
  const added = add.map((m) => ({ ...m, isMain: false }));
  const byFen = new Map<string, { added: RepMove[]; kept: ExistingMove[] }>();
  for (const m of added) (byFen.get(m.fromFen) ?? byFen.set(m.fromFen, { added: [], kept: [] }).get(m.fromFen)!).added.push(m);
  for (const m of kept) (byFen.get(m.fromFen) ?? byFen.set(m.fromFen, { added: [], kept: [] }).get(m.fromFen)!).kept.push(m);
  for (const [fen, moves] of byFen) {
    if (mainAt.has(fen)) continue;
    const sourceMain = target.movesAt(fen).find((m) => m.isMain)?.uci;
    const pick =
      moves.added.find((m) => m.uci === sourceMain) ?? moves.kept.find((m) => m.uci === sourceMain) ?? moves.kept[0] ?? moves.added[0];
    if (!pick) continue;
    if ('id' in pick) update.push({ id: (pick as ExistingMove).id, isMain: true });
    else pick.isMain = true;
  }

  return { add: added, remove, update: mergeUpdates(update), errors: parsed.errors, unreachable };
}

function mergeUpdates(updates: SyncPlan['update']): SyncPlan['update'] {
  const byId = new Map<number, SyncPlan['update'][number]>();
  for (const u of updates) byId.set(u.id, { ...byId.get(u.id), ...u });
  return [...byId.values()];
}
