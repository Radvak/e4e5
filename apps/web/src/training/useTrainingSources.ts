import {
  keptPositions,
  positionReview,
  Repertoire,
  START_FEN,
  trainingPositions,
  trainingPositionsFrom,
  type Color,
  type TrainingPosition,
} from '@tabiya/core';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type Grade, type ReviewCard } from '../api';
import { cardsQuery, recordReview } from '../offline/reviews';

/** Summary of the cards of my moves in a position (several moves: the weakest). */
export interface PositionCard {
  /** Mean estimated probability of finding each move now (0 for a move not learnt yet). */
  recall: number;
  /** Earliest next review (ms). */
  due: number;
  /** Shortest interval in days (0 while learning). */
  interval: number;
  /** Most lapses of a move. */
  lapses: number;
  /** Every move of the position is learnt. */
  complete: boolean;
}

/** A repertoire being trained, with its positions; review state comes from the user's move cards. */
export interface Source {
  id: string;
  name: string;
  color: Color;
  rep: Repertoire;
  /** Positions to train (limited to the subtree of `from` when given). */
  positions: TrainingPosition[];
  /** Card of one of my moves (learnt in this repertoire or another one). */
  cardOf: (fen: string, uci: string) => ReviewCard | undefined;
  /** What a position needs now: due, new or learnt, and the moves to ask (see core positionReview). */
  stateOf: (fen: string, now: number) => ReturnType<typeof positionReview>;
  /** Summary of the cards of my moves in a position; undefined: none learnt. */
  positionCard: (fen: string) => PositionCard | undefined;
}

const cardKey = (fen: string, uci: string) => `${fen} ${uci}`;

/** Lines stopped at the positions coming up in at least `minReach` of the games (`reach`). */
export interface Shorten {
  minReach: number;
  reach: (color: Color, fen: string) => number | undefined;
}

/**
 * Loads the repertoires `ids` and the user's move cards; `review` records an answer. With
 * `shorten`, only the positions kept by core keptPositions are trained.
 */
export function useTrainingSources(ids: string[], from: string | null, shorten?: Shorten | null) {
  const qc = useQueryClient();
  const repQueries = useQueries({
    queries: ids.map((id) => ({ queryKey: ['repertoire', id], queryFn: () => api.repertoire(id) })),
  });
  const cardQuery = useQuery(cardsQuery);
  const loading = repQueries.some((q) => q.isLoading) || cardQuery.isLoading;
  const version = repQueries.map((q) => q.dataUpdatedAt).join();

  const cards = useMemo(() => new Map((cardQuery.data ?? []).map((c) => [cardKey(c.fen, c.uci), c])), [cardQuery.data]);

  const sources = useMemo<Source[]>(
    () =>
      ids.flatMap((id, i) => {
        const data = repQueries[i]?.data;
        if (!data) return [];
        const rep = new Repertoire(data.color, data.moves);
        const kept = shorten && shorten.minReach > 0 ? keptPositions(trainingPositions(rep), (f) => shorten.reach(data.color, f), shorten.minReach) : null;
        const positions = trainingPositionsFrom(rep, from ?? START_FEN);
        const cardOf = (fen: string, uci: string) => cards.get(cardKey(fen, uci));
        const times = (fen: string) => (uci: string) => {
          const c = cardOf(fen, uci);
          return c && { due: Date.parse(c.due), createdAt: Date.parse(c.createdAt) };
        };
        return [{
          id,
          name: data.name,
          color: data.color,
          rep,
          positions: kept ? positions.filter((p) => kept.has(p.fen)) : positions,
          cardOf,
          stateOf: (fen, now) => positionReview(rep.movesAt(fen), times(fen), now),
          positionCard: (fen) => {
            const moves = rep.movesAt(fen);
            const known = moves.map((m) => cardOf(fen, m.uci)).filter((c) => !!c);
            if (!known.length) return undefined;
            return {
              recall: known.reduce((n, c) => n + c.recall, 0) / moves.length,
              due: Math.min(...known.map((c) => Date.parse(c.due))),
              interval: Math.min(...known.map((c) => c.interval)),
              lapses: Math.max(...known.map((c) => c.lapses)),
              complete: known.length === moves.length,
            };
          },
        } satisfies Source];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids.join(), version, from, cards, shorten],
  );

  /** Records an answer: scheduled on the device at once, sent to the server now or when it can be reached. */
  const review = {
    mutate: ({ source, fen, uci, grade }: { source: Source; fen: string; uci: string; grade: Grade }) =>
      recordReview(qc, source.cardOf(fen, uci), { repertoireId: source.id, fen, uci, grade }),
  };

  return { sources, loading, review };
}
