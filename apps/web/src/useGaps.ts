import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type Me } from './api';
import { explorerParams, useSettings } from './settings';

/**
 * Gap finder report (both colours) for the user's statistics settings: depth per repertoire and
 * holes, on the stored statistics (nothing is fetched).
 */
export function useGaps(me: Me | undefined, enabled = true) {
  const { speed, range, gapCutoff } = useSettings();
  const ex = me ? explorerParams(me, speed, range) : { speeds: [], ratings: [] };
  return useQuery({
    queryKey: ['gaps', ex.speeds, ex.ratings, gapCutoff],
    queryFn: () => api.gaps(ex.speeds, ex.ratings, gapCutoff),
    enabled: enabled && !!me,
    staleTime: 60_000,
  });
}

type Reach = Record<string, number> | undefined;
export interface GapReach {
  /** Probability of reaching each position of the repertoires of a colour (gap report). */
  reach: { white: Reach; black: Reach } | undefined;
  isLoading: boolean;
}

/**
 * The reach probabilities of the gap report, for the heavy computations (training summary, lines
 * shortened by depth, order of the new lines): a stable object while they are unchanged.
 */
export function useGapReach(me: Me | undefined): GapReach {
  const gaps = useGaps(me);
  const white = gaps.data?.white?.reach;
  const black = gaps.data?.black?.reach;
  const reach = useMemo(() => (gaps.data ? { white, black } : undefined), [gaps.data ? 1 : 0, white, black]);
  return { reach, isLoading: gaps.isLoading };
}
