import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type BestMovesResponse } from '../api';
import { Icon } from '../ui';

/**
 * On/off of the "moves at my level" search, kept for the browser session only: it costs many
 * Lichess requests, so it never starts by itself on a new visit.
 */
export function useLevelToggle() {
  const [on, setOn] = useState(() => sessionStorage.getItem('level') === 'on');
  const toggle = (next: boolean) => {
    sessionStorage.setItem('level', next ? 'on' : 'off');
    setOn(next);
  };
  return [on, toggle] as const;
}

/** Steps of the search at my level (server REACH_STEPS): "profondeur" checked follows them all. */
export const LEVEL_STEPS = 4;

/**
 * Whether the search at my level follows the likely lines ("profondeur", kept on this device) as
 * a number of steps: 0 (each move's own score) or all of them.
 */
export function useLevelDepth() {
  const [depth, setDepth] = useState(() => (localStorage.getItem('levelDepth') === '0' ? 0 : LEVEL_STEPS));
  const set = (d: number) => {
    localStorage.setItem('levelDepth', String(d));
    setDepth(d);
  };
  return [depth, set] as const;
}

/**
 * Suggested moves for the side to move: best expected score at my level over the likely lines.
 * The deeper positions are fetched in the background by the server, so it asks again meanwhile.
 * Only asked while `enabled`.
 */
export function useBestMoves(fen: string, speeds: string[], ratings: number[], enabled: boolean, depth?: number) {
  return useQuery({
    queryKey: ['best-moves', fen, speeds, ratings, depth ?? 'max'],
    queryFn: () => api.bestMoves(fen, speeds, ratings, depth),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
    refetchInterval: (query) => (query.state.data?.pending ? 4000 : false),
  });
}

/** The move to draw on the board: the best one looked at the furthest. */
export function topLevelMove(data: BestMovesResponse | undefined) {
  return data?.moves.find((m) => m.minReach === data.reach) ?? data?.moves[0];
}

/** On/off button, next to the engine's. */
export function LevelToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (on: boolean) => void }) {
  return (
    <button
      className={`level-toggle ${enabled ? 'on' : ''}`}
      onClick={() => onToggle(!enabled)}
      title={enabled ? 'Arrêter les coups à votre niveau (n)' : 'Coups à votre niveau : meilleur score espéré face aux joueurs Lichess de votre niveau (n)'}
      aria-label={enabled ? 'Arrêter les coups à votre niveau' : 'Coups à votre niveau'}
      aria-pressed={enabled}
    >
      <Icon name="level" />
    </button>
  );
}
