import { useQuery } from '@tanstack/react-query';
import { api, type Me } from './api';
import { dayStart, explorerParams, useSettings } from './settings';

/**
 * Training summary per repertoire (lines to review, new lines today), with the user's settings:
 * new lines per day, and shortened lines (with the statistics settings giving the probabilities).
 */
export function useTrainingSummary(me: Me | undefined, options: { staleTime?: number } = {}) {
  const { newPerDay, keepShare, speed, range, gapCutoff } = useSettings();
  const ex = me ? explorerParams(me, speed, range) : null;
  const short = ex && keepShare < 100 ? { keep: keepShare / 100, speeds: ex.speeds, ratings: ex.ratings, cutoff: gapCutoff } : undefined;
  return useQuery({
    queryKey: ['training-summary', newPerDay, short],
    queryFn: () => api.trainingSummary(dayStart(), newPerDay, short),
    enabled: !!me,
    ...options,
  });
}
