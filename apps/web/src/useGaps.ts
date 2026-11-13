import { useQuery } from '@tanstack/react-query';
import { api, type Me } from './api';
import { explorerParams, useSettings } from './settings';

/**
 * Gap finder report (both colours) for the user's statistics settings: depth per repertoire and
 * holes. Missing statistics are fetched in the background, so it asks again while some are pending.
 */
export function useGaps(me: Me, enabled = true) {
  const { speed, range, gapCutoff } = useSettings();
  const ex = explorerParams(me, speed, range);
  return useQuery({
    queryKey: ['gaps', ex.speeds, ex.ratings, gapCutoff],
    queryFn: () => api.gaps(ex.speeds, ex.ratings, gapCutoff),
    enabled,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.white?.pending || q.state.data?.black?.pending ? 4000 : false),
  });
}

/** "6,2" */
export const depthText = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
