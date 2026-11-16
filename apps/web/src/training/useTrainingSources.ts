import {
  positionReview,
  Repertoire,
  START_FEN,
  trainingPositionsFrom,
  type Color,
  type TrainingPosition,
} from '@prepa-cahier/core';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type Grade, type ReviewCard } from '../api';

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

/** Loads the repertoires `ids` and the user's move cards; `review` records an answer. */
export function useTrainingSources(ids: string[], from: string | null) {
  const qc = useQueryClient();
  const repQueries = useQueries({
    queries: ids.map((id) => ({ queryKey: ['repertoire', id], queryFn: () => api.repertoire(id) })),
  });
  const cardQuery = useQuery({ queryKey: ['cards'], queryFn: api.cards });
  const loading = repQueries.some((q) => q.isLoading) || cardQuery.isLoading;
  const version = repQueries.map((q) => q.dataUpdatedAt).join();

  const cards = useMemo(() => new Map((cardQuery.data ?? []).map((c) => [cardKey(c.fen, c.uci), c])), [cardQuery.data]);

  const sources = useMemo<Source[]>(
    () =>
      ids.flatMap((id, i) => {
        const data = repQueries[i]?.data;
        if (!data) return [];
        const rep = new Repertoire(data.color, data.moves);
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
          positions: trainingPositionsFrom(rep, from ?? START_FEN),
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
    [ids.join(), version, from, cards],
  );

  const putCard = (card: ReviewCard) =>
    qc.setQueryData<ReviewCard[]>(['cards'], (old = []) => [...old.filter((c) => c.fen !== card.fen || c.uci !== card.uci), card]);

  const review = useMutation({
    mutationFn: ({ source, fen, uci, grade }: { source: Source; fen: string; uci: string; grade: Grade }) =>
      api.review(source.id, fen, uci, grade),
    onMutate: ({ source, fen, uci }) => {
      // Optimistic: not due any more until the server answers with the real schedule.
      const old = source.cardOf(fen, uci);
      putCard({
        fen,
        uci,
        recall: 1,
        due: new Date(Date.now() + 60_000).toISOString(),
        reps: (old?.reps ?? 0) + 1,
        lapses: old?.lapses ?? 0,
        interval: old?.interval ?? 0,
        createdAt: old?.createdAt ?? new Date().toISOString(),
      });
    },
    onSuccess: (card) => {
      putCard(card);
      qc.invalidateQueries({ queryKey: ['training-summary'] });
      qc.invalidateQueries({ queryKey: ['stats-history'] });
    },
    onError: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });

  return { sources, loading, review };
}
