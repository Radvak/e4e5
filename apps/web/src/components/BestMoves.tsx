import type { Color } from '@tabiya/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type BestMovesResponse } from '../api';

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
 * On the opponent's turn (`color` my side), each of its moves scored for me, the search starting
 * after it. The deeper positions are fetched in the background by the server, so it asks again
 * meanwhile. Only asked while `enabled`.
 */
export function useBestMoves(fen: string, speeds: string[], ratings: number[], enabled: boolean, depth?: number, color?: Color) {
  return useQuery({
    queryKey: ['best-moves', fen, speeds, ratings, depth ?? 'max', color ?? 'turn'],
    queryFn: () => api.bestMoves(fen, speeds, ratings, depth, color),
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

