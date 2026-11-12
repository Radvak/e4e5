import {
  Repertoire,
  START_FEN,
  trainingPositionsFrom,
  type Color,
  type TrainingPosition,
} from '@prepa-cahier/core';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type Grade, type ReviewCard } from '../api';

/** A repertoire being trained, with its positions and review state. */
export interface Source {
  id: string;
  name: string;
  color: Color;
  rep: Repertoire;
  /** Positions to train (limited to the subtree of `from` when given). */
  positions: TrainingPosition[];
  cards: Map<string, ReviewCard>;
  cardList: ReviewCard[];
}

/** Loads the repertoires `ids` and their review cards; `review` records an answer. */
export function useTrainingSources(ids: string[], from: string | null) {
  const qc = useQueryClient();
  const repQueries = useQueries({
    queries: ids.map((id) => ({ queryKey: ['repertoire', id], queryFn: () => api.repertoire(id) })),
  });
  const cardQueries = useQueries({
    queries: ids.map((id) => ({ queryKey: ['cards', id], queryFn: () => api.cards(id) })),
  });
  const loading = repQueries.some((q) => q.isLoading) || cardQueries.some((q) => q.isLoading);
  const version = [...repQueries, ...cardQueries].map((q) => q.dataUpdatedAt).join();

  const sources = useMemo<Source[]>(
    () =>
      ids.flatMap((id, i) => {
        const data = repQueries[i]?.data;
        if (!data) return [];
        const rep = new Repertoire(data.color, data.moves);
        const cardList = cardQueries[i]?.data ?? [];
        return [{
          id,
          name: data.name,
          color: data.color,
          rep,
          positions: trainingPositionsFrom(rep, from ?? START_FEN),
          cards: new Map(cardList.map((c) => [c.fen, c])),
          cardList,
        }];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids.join(), version, from],
  );

  const putCard = (sourceId: string, card: ReviewCard) =>
    qc.setQueryData<ReviewCard[]>(['cards', sourceId], (old = []) => [...old.filter((c) => c.fen !== card.fen), card]);

  const review = useMutation({
    mutationFn: ({ source, fen, grade }: { source: Source; fen: string; grade: Grade }) => api.review(source.id, fen, grade),
    onMutate: ({ source, fen }) => {
      // Optimistic: not due any more until the server answers with the real schedule.
      const old = source.cards.get(fen);
      putCard(source.id, {
        fen,
        recall: 1,
        due: new Date(Date.now() + 60_000).toISOString(),
        reps: (old?.reps ?? 0) + 1,
        lapses: old?.lapses ?? 0,
        interval: old?.interval ?? 0,
        createdAt: old?.createdAt ?? new Date().toISOString(),
      });
    },
    onSuccess: (card, { source }) => {
      putCard(source.id, card);
      qc.invalidateQueries({ queryKey: ['training-summary'] });
      qc.invalidateQueries({ queryKey: ['stats-history'] });
    },
    onError: (_e, { source }) => qc.invalidateQueries({ queryKey: ['cards', source.id] }),
  });

  return { sources, loading, review };
}
