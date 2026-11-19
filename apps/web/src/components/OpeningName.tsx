import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api';

/**
 * Name of the opening of a line (UCI moves from the initial position), in small above a board:
 * its last named position (Lichess names). Keeps its height (the board does not move) and the
 * previous name while the next one loads.
 */
export function OpeningName({ ucis }: { ucis: string[] }) {
  const line = ucis.join(',');
  const opening = useQuery({
    queryKey: ['opening', line],
    queryFn: () => api.opening(line),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  const name = ucis.length > 0 ? opening.data?.name : undefined;
  return (
    <div className="opening-name" title={name}>
      {name ?? ' '}
    </div>
  );
}
