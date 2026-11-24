/**
 * Repertoire graphs and what follows from them alone, built once per repertoire version and
 * shared by every page (training, summary badge, progress): an answer only changes the cards,
 * so nothing here is rebuilt after it. Keys are the objects themselves (the repertoire as cached
 * by React Query, the reach probabilities of a gap report): a refetch gives new objects, the old
 * entries go with them (WeakMap).
 */
import {
  keptPositions,
  prepareSummary,
  trainingRepertoire,
  type Repertoire,
  trainingPositions,
  trainingPositionsFrom,
  type PreparedSummary,
  type TrainingPosition,
} from '@e4e5/core';
import type { RepertoireDetail } from '../api';

const graphs = new WeakMap<RepertoireDetail, Repertoire>();
const allPositions = new WeakMap<Repertoire, TrainingPosition[]>();
const fromPositions = new WeakMap<Repertoire, Map<string, TrainingPosition[]>>();
const kept = new WeakMap<TrainingPosition[], WeakMap<object, Map<number, Set<string>>>>();
const prepared = new WeakMap<RepertoireDetail, Map<string, { probs: object | undefined; value: PreparedSummary }>>();

/** The graph of a repertoire, as trained (paused moves left out). */
export function graphOf(detail: RepertoireDetail): Repertoire {
  let g = graphs.get(detail);
  if (!g) graphs.set(detail, (g = trainingRepertoire(detail.color, detail.moves)));
  return g;
}

/** Every position where it is my turn (core trainingPositions). */
export function positionsOf(rep: Repertoire): TrainingPosition[] {
  let p = allPositions.get(rep);
  if (!p) allPositions.set(rep, (p = trainingPositions(rep)));
  return p;
}

/** The positions of the subtree of `from` (core trainingPositionsFrom). */
export function positionsFrom(rep: Repertoire, from: string): TrainingPosition[] {
  let byFrom = fromPositions.get(rep);
  if (!byFrom) fromPositions.set(rep, (byFrom = new Map()));
  let p = byFrom.get(from);
  if (!p) byFrom.set(from, (p = trainingPositionsFrom(rep, from)));
  return p;
}

/** Positions kept at the depth of the lines (core keptPositions), for one map of probabilities. */
export function keptOf(positions: TrainingPosition[], probs: Record<string, number>, minReach: number): Set<string> {
  let byProbs = kept.get(positions);
  if (!byProbs) kept.set(positions, (byProbs = new WeakMap()));
  let byDepth = byProbs.get(probs);
  if (!byDepth) byProbs.set(probs, (byDepth = new Map()));
  let set = byDepth.get(minReach);
  if (!set) byDepth.set(minReach, (set = keptPositions(positions, (f) => probs[f], minReach)));
  return set;
}

/** The part of the training summary that does not depend on the cards (core prepareSummary). */
export function preparedOf(detail: RepertoireDetail, probs: Record<string, number> | undefined, depth: number): PreparedSummary {
  let byDepth = prepared.get(detail);
  if (!byDepth) prepared.set(detail, (byDepth = new Map()));
  const key = String(depth);
  const hit = byDepth.get(key);
  if (hit && hit.probs === probs) return hit.value;
  const graph = graphOf(detail);
  const value = prepareSummary({ id: detail.id, active: detail.active, graph, all: positionsOf(graph) }, probs, depth);
  byDepth.set(key, { probs, value });
  return value;
}
