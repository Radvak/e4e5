/**
 * Training summary per repertoire: positions due now, new lines available today (one daily limit
 * for all repertoires), lines to go through, totals. Computed in the browser from the repertoires,
 * the move cards and the reach probabilities, so it is right offline and at once after an answer.
 */
import type { Color } from './position.js';
import { Repertoire, type RepMove } from './repertoire.js';
import { groupLines, keptPositions, LINE_DEPTHS, lineStarts, positionReview, trainingPositions, type MoveCardTimes } from './training.js';

export interface SummaryRepertoire {
  id: string;
  color: Color;
  active: boolean;
  moves: Iterable<RepMove>;
}

export interface SummaryOptions {
  /** Start of the user's day (ms), for the daily limit of new lines. */
  dayStart: number;
  /** New lines to learn per day, all repertoires together. */
  newPerDay: number;
  /** Depth of the lines: positions coming up in at least this share of the games (0: whole lines). */
  depth: number;
  now: number;
}

export interface RepertoireSummaryCounts {
  repertoireId: string;
  active: boolean;
  /** Positions trained (at the depth of the lines). */
  total: number;
  /** Every position of mine in the repertoire (whole lines). */
  positions: number;
  /** Positions trained at each depth of the lines (null: no reach probabilities). */
  byDepth: Record<string, number> | null;
  /** Lines of the repertoire: its distinct line ends. */
  totalLines: number;
  due: number;
  /** Lines formed by the due positions. */
  dueLines: number;
  learntTodayLines: number;
  /** Whole lines not learnt yet. */
  availableLines: number;
  /** Lines still to learn today, all repertoires together (same for every item). */
  remainingNewLines: number;
  /** New lines this repertoire can take today. */
  newLines: number;
  /** Lines to go through today in this repertoire: to review + new. */
  lines: number;
}

/**
 * `cardOf`: times of my card for a move (shared by every repertoire). `reach`: probability of
 * reaching each position at my level, per colour (null or missing colour: whole lines).
 */
export function trainingSummary(
  reps: SummaryRepertoire[],
  cardOf: (fen: string, uci: string) => MoveCardTimes | undefined,
  reach: ((color: Color) => Record<string, number> | undefined) | null,
  { dayStart, newPerDay, depth, now }: SummaryOptions,
): RepertoireSummaryCounts[] {
  // A line learnt today that is in several repertoires (shared moves) counts once, in the first one.
  const countedToday = new Set<string>();
  const rows = reps.map((r) => {
    const graph = new Repertoire(r.color, r.moves);
    const probs = reach?.(r.color);
    const all = trainingPositions(graph);
    const reachOf = (f: string) => probs?.[f];
    const kept = probs && depth > 0 ? keptPositions(all, reachOf, depth) : null;
    const list = kept ? all.filter((p) => kept.has(p.fen)) : all;
    const state = new Map(list.map((p) => [p.fen, positionReview(graph.movesAt(p.fen), (uci) => cardOf(p.fen, uci), now)]));
    const fresh = list.filter((p) => state.get(p.fen)!.status === 'new');
    const today = new Set(list.filter((p) => (state.get(p.fen)!.learntAt ?? 0) >= dayStart).map((p) => p.fen));
    const dueSet = new Set(list.filter((p) => state.get(p.fen)!.status === 'due').map((p) => p.fen));
    return {
      r,
      total: list.length,
      positions: all.length,
      byDepth: probs ? Object.fromEntries(LINE_DEPTHS.map((d) => [String(d), keptPositions(all, reachOf, d).size])) : null,
      totalLines: [...graph.reachable()].filter((f) => graph.movesAt(f).length === 0).length,
      due: dueSet.size,
      dueLines: lineStarts(list.filter((p) => dueSet.has(p.fen)), (f) => dueSet.has(f)).length,
      learntTodayLines: lineStarts(list.filter((p) => today.has(p.fen)), (f) => today.has(f)).filter((p) => {
        if (countedToday.has(p.fen)) return false;
        countedToday.add(p.fen);
        return true;
      }).length,
      availableLines: groupLines(fresh).length,
    };
  });
  const remaining = Math.max(0, newPerDay - rows.reduce((n, x) => n + x.learntTodayLines, 0));
  return rows.map(({ r, ...x }) => {
    const newLines = r.active ? Math.min(remaining, x.availableLines) : 0;
    return { repertoireId: r.id, active: r.active, ...x, remainingNewLines: remaining, newLines, lines: x.dueLines + newLines };
  });
}
