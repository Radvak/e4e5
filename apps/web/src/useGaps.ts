import { useQuery } from '@tanstack/react-query';
import { api, type Me } from './api';
import { explorerParams, useSettings } from './settings';

/**
 * Gap finder report (both colours) for the user's statistics settings: depth per repertoire and
 * holes. Missing statistics are fetched in the background, so it asks again while some are pending.
 */
export function useGaps(me: Me | undefined, enabled = true) {
  const { speed, range, gapCutoff } = useSettings();
  const ex = me ? explorerParams(me, speed, range) : { speeds: [], ratings: [] };
  return useQuery({
    queryKey: ['gaps', ex.speeds, ex.ratings, gapCutoff],
    queryFn: () => api.gaps(ex.speeds, ex.ratings, gapCutoff),
    enabled: enabled && !!me,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.white?.pending || q.state.data?.black?.pending ? 4000 : false),
  });
}

