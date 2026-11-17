import { useQuery } from '@tanstack/react-query';
import { api, type Me } from './api';
import { dayStart, explorerParams, useSettings } from './settings';

/**
 * Training summary per repertoire (lines to review, new lines today), with the user's settings:
 * new lines per day, and the depth of the lines (with the statistics settings giving the
 * probabilities; also the positions trained at each depth).
 */
export function useTrainingSummary(me: Me | undefined, options: { staleTime?: number } = {}) {
  const { newPerDay, lineDepth, speed, range } = useSettings();
  const ex = me ? explorerParams(me, speed, range) : null;
  const lines = ex ? { depth: lineDepth, speeds: ex.speeds, ratings: ex.ratings } : undefined;
  return useQuery({
    queryKey: ['training-summary', newPerDay, lines],
    queryFn: () => api.trainingSummary(dayStart(), newPerDay, lines),
    enabled: !!me,
    ...options,
  });
}
