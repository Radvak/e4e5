import { positionFromFen, START_FEN } from '@prepa-cahier/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, type Grade, type Me } from '../api';
import { explorerParams, useSettings } from '../settings';
import { Button, PageHeader, Tabs } from '../ui';
import { lineText } from '../training/common';
import { PlayMode } from '../training/PlayMode';
import { Progress } from '../training/Progress';
import { ReviewMode } from '../training/ReviewMode';
import { useTrainingSources, type Source } from '../training/useTrainingSources';

type Mode = 'review' | 'play';

/**
 * Training page, for one repertoire (/r/:id/train, optionally ?from=<fen> for a subtree) or all
 * of them (/train). Two modes: spaced-repetition review, and playing lines against the app.
 */
export function Training({ me }: { me: Me }) {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const fromParam = id ? params.get('from') : null;
  const from = useMemo(() => {
    if (!fromParam) return null;
    try {
      positionFromFen(fromParam);
      return fromParam;
    } catch {
      return null;
    }
  }, [fromParam]);

  const all = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires, enabled: !id });
  const ids = useMemo(() => (id ? [id] : (all.data ?? []).map((r) => r.id)), [id, all.data]);
  const { sources, loading, review } = useTrainingSources(ids, from);

  const { newPerDay, speed, range } = useSettings();
  const ex = explorerParams(me, speed, range);
  const [mode, setModeState] = useState<Mode>(() => (localStorage.getItem('trainingMode') as Mode | null) ?? 'review');
  const setMode = (m: Mode) => {
    localStorage.setItem('trainingMode', m);
    setModeState(m);
  };
  const [counts, setCounts] = useState({ due: 0, fresh: 0, reviewed: 0, asked: 0, firstTry: 0 });
  const onCounts = useCallback((c: typeof counts) => setCounts(c), []);
  const onReview = (source: Source, fen: string, grade: Grade) => review.mutate({ source, fen, grade });

  if (loading || (!id && all.isLoading)) return <p className="muted">Chargement…</p>;
  if (id && !sources.length) return <p className="error">Impossible de charger le répertoire.</p>;

  const fromPath = from && sources[0] ? sources[0].positions.find((p) => p.fen === from)?.path : undefined;
  const title = id ? sources[0]!.name : 'Tous les répertoires';

  return (
    <div className="training">
      <PageHeader
        back={id ? `/r/${id}` : undefined}
        title="Entraînement"
        subtitle={
          mode === 'review'
            ? `${title} · ${counts.due} à revoir · ${counts.fresh} nouvelles · ${counts.reviewed} faites${
                counts.asked > 0 ? ` (${Math.round((100 * counts.firstTry) / counts.asked)} % du premier coup)` : ''
              }`
            : title
        }
      />
      <div style={{ marginBottom: 12 }}>
        <Tabs
          block
          value={mode}
          onChange={setMode}
          tabs={[
            { id: 'review', label: 'Réviser' },
            { id: 'play', label: 'Jouer les lignes' },
          ]}
        />
      </div>
      {from && (
        <p className="muted from">
          Seulement les lignes après <strong>{fromPath ? lineText(fromPath) : 'cette position'}</strong>.{' '}
          <Button size="sm" variant="ghost" onClick={() => setParams({})}>Tout entraîner</Button>
        </p>
      )}
      {review.error && <p className="error">{review.error.message}</p>}

      {mode === 'review' ? (
        <ReviewMode
          sources={sources}
          newPerDay={newPerDay}
          noNewLimit={!!from}
          onReview={onReview}
          onCounts={onCounts}
          idle={<Progress sources={sources} />}
        />
      ) : (
        <PlayMode
          key={`${ids.join()}-${from ?? ''}`}
          sources={sources}
          root={from ?? START_FEN}
          speeds={ex.speeds}
          ratings={ex.ratings}
          onReview={onReview}
        />
      )}
      {mode === 'play' && <Progress sources={sources} />}
    </div>
  );
}
