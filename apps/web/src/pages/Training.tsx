import { positionFromFen, START_FEN } from '@prepa-cahier/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, type Grade, type Me } from '../api';
import { dayStart, explorerParams, useSettings } from '../settings';
import { useGaps } from '../useGaps';
import { Button, PageHeader, Tabs, plural } from '../ui';
import { lineText } from '../training/common';
import { PlayMode } from '../training/PlayMode';
import { Progress } from '../training/Progress';
import { Stats } from './Stats';
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
  // All repertoires: the active ones only (paused ones are left out).
  const ids = useMemo(() => (id ? [id] : (all.data ?? []).filter((r) => r.active).map((r) => r.id)), [id, all.data]);
  const { sources, loading, review } = useTrainingSources(ids, from);

  const { newPerDay, speed, range, learnOrder } = useSettings();
  // Order of the new positions: most played at the user's level (reach probabilities of the gap finder).
  const gaps = useGaps(me, learnOrder === 'frequency');
  // The daily limit of new lines is shared by all repertoires: lines learnt today elsewhere count.
  const summary = useQuery({ queryKey: ['training-summary', newPerDay], queryFn: () => api.trainingSummary(dayStart(), newPerDay) });
  const learntElsewhere = (summary.data ?? []).filter((s) => !ids.includes(s.repertoireId)).reduce((n, s) => n + s.learntTodayLines, 0);
  const reachOf = useMemo(() => {
    if (learnOrder !== 'frequency' || !gaps.data) return undefined;
    return (source: Source, fen: string) => gaps.data?.[source.color]?.reach[fen];
  }, [learnOrder, gaps.data]);
  const ex = explorerParams(me, speed, range);
  // ?mode=test opens "Se tester" (e.g. from the home page when nothing is due), ?mode=review
  // "Réviser" (e.g. an error of Mes parties); else the last mode used.
  const [mode, setModeState] = useState<Mode>(() =>
    params.get('mode') === 'test'
      ? 'play'
      : params.get('mode') === 'review'
        ? 'review'
        : ((localStorage.getItem('trainingMode') as Mode | null) ?? 'review'),
  );
  const setMode = (m: Mode) => {
    localStorage.setItem('trainingMode', m);
    setModeState(m);
  };
  const [counts, setCounts] = useState({ dueLines: 0, freshLines: 0, reviewed: 0, asked: 0, firstTry: 0 });
  const onCounts = useCallback((c: typeof counts) => setCounts(c), []);
  const onReview = (source: Source, fen: string, grade: Grade) => review.mutate({ source, fen, grade });

  if (loading || (!id && all.isLoading)) return <p className="muted">Chargement…</p>;
  if (id && !sources.length) return <p className="error">Impossible de charger le répertoire.</p>;

  const fromPath = from && sources[0] ? sources[0].positions.find((p) => p.fen === from)?.path : undefined;
  const title = id ? sources[0]!.name : 'Tous les répertoires actifs';

  return (
    <div className="training">
      <PageHeader
        back={id ? `/r/${id}` : undefined}
        title="Entraînement"
        subtitle={
          mode === 'review'
            ? `${title} · ${plural(counts.dueLines, 'ligne', 'lignes')} à revoir · ${plural(counts.freshLines, 'nouvelle', 'nouvelles')}${
                counts.reviewed > 0
                  ? ` · ${plural(counts.reviewed, 'réponse', 'réponses')}${counts.asked > 0 ? ` (${Math.round((100 * counts.firstTry) / counts.asked)} % du premier coup)` : ''}`
                  : ''
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
            { id: 'play', label: 'Se tester' },
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

      <p className="muted small-text mode-hint">
        {mode === 'review'
          ? 'Les positions à revoir aujourd’hui, au bon moment pour les retenir.'
          : 'Sur ce que vous avez appris, sans aide : l’adversaire joue les coups les plus fréquents à votre niveau, comme en partie.'}
      </p>

      {mode === 'review' ? (
        <ReviewMode
          sources={sources}
          newPerDay={newPerDay}
          noNewLimit={!!from}
          onReview={onReview}
          onCounts={onCounts}
          onTest={() => setMode('play')}
          reachOf={reachOf}
          learntElsewhere={learntElsewhere}
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
          onLearn={() => setMode('review')}
        />
      )}
      {mode === 'play' && <Progress sources={sources} />}

      {/* Progress of every repertoire (was the Bilan page): activity, forecast, weak positions. */}
      {!id && (
        <details className="panel progress-all">
          <summary>Progrès</summary>
          <Stats />
        </details>
      )}
    </div>
  );
}
