import { trainingSummary, type RepertoireSummaryCounts } from '@tabiya/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api, type Me } from './api';
import { cardsQuery } from './offline/reviews';
import { dayStart, useSettings } from './settings';
import { useGaps } from './useGaps';

/** The current time, updated every minute (positions become due as time passes). */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Training summary per repertoire (lines to review, new lines today), with the user's settings:
 * new lines per day, and the depth of the lines (the gap report gives the probabilities; also the
 * positions trained at each depth). Computed on the device from the repertoires, the move cards
 * and the gap report (core trainingSummary): right offline, and at once after an answer. Loading
 * it loads every repertoire, which keeps them all on the device for offline training.
 */
export function useTrainingSummary(me: Me | undefined): { data: RepertoireSummaryCounts[] | undefined } {
  const { newPerDay, lineDepth } = useSettings();
  const list = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires, enabled: !!me });
  const reps = useQueries({
    queries: (list.data ?? []).map((r) => ({ queryKey: ['repertoire', r.id], queryFn: () => api.repertoire(r.id), enabled: !!me })),
  });
  const cards = useQuery({ ...cardsQuery, enabled: !!me });
  const gaps = useGaps(me);
  const now = useMinute();
  const repsVersion = reps.map((q) => q.dataUpdatedAt).join();

  const data = useMemo(() => {
    if (!list.data || !cards.data || reps.some((q) => !q.data)) return undefined;
    // Shortened lines need the probabilities: wait for them (unless they cannot be had).
    if (lineDepth > 0 && gaps.isLoading) return undefined;
    const cardMap = new Map(cards.data.map((c) => [`${c.fen} ${c.uci}`, { due: Date.parse(c.due), createdAt: Date.parse(c.createdAt) }]));
    const report = gaps.data;
    return trainingSummary(
      reps.map((q) => ({ id: q.data!.id, color: q.data!.color, active: q.data!.active, moves: q.data!.moves })),
      (fen, uci) => cardMap.get(`${fen} ${uci}`),
      report ? (color) => report[color]?.reach : null,
      { dayStart: dayStart(new Date(now)), newPerDay, depth: lineDepth, now },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, repsVersion, cards.data, gaps.data, gaps.isLoading, lineDepth, newPerDay, now]);
  return { data };
}
