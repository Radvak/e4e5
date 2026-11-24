import { positionFromFen, START_FEN, type Color } from '@tabiya/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type Grade, type Me } from '../api';
import { explorerParams, useSettings } from '../settings';
import { useTrainingSummary } from '../useTrainingSummary';
import { useGaps } from '../useGaps';
import { Button, PageHeader, Tabs, plural } from '../ui';
import { lineText } from '../training/common';
import { PlayMode, type PlayScore } from '../training/PlayMode';
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
  // All repertoires: the active ones only (paused ones are left out).
  const ids = useMemo(() => (id ? [id] : (all.data ?? []).filter((r) => r.active).map((r) => r.id)), [id, all.data]);
  const { newPerDay, speed, range, learnOrder, lineDepth } = useSettings();
  // Reach probabilities at the user's level (gap finder): order of the new positions (when
  // learning by frequency), branch followed to finish a line, and shortened lines.
  const gaps = useGaps(me);
  // Depth of the lines (Paramètres), also when training a chosen part (?from=); whole lines
  // without statistics.
  const shortening = lineDepth > 0;
  const shorten = useMemo(
    () => (shortening && gaps.data ? { minReach: lineDepth, probs: (color: Color) => gaps.data?.[color]?.reach } : null),
    [shortening, lineDepth, gaps.data],
  );
  const { sources, loading, review } = useTrainingSources(ids, from, shorten);
  // The daily limit of new lines is shared by all repertoires: lines learnt today elsewhere count.
  const summary = useTrainingSummary(me);
  const learntElsewhere = (summary.data ?? []).filter((s) => !ids.includes(s.repertoireId)).reduce((n, s) => n + s.learntTodayLines, 0);
  const reachOf = useMemo(() => {
    if (learnOrder !== 'frequency' || !gaps.data) return undefined;
    return (source: Source, fen: string) => gaps.data?.[source.color]?.reach[fen];
  }, [learnOrder, gaps.data]);
  const chanceOf = useMemo(() => {
    if (!gaps.data) return undefined;
    return (source: Source, fen: string) => gaps.data?.[source.color]?.reach[fen];
  }, [gaps.data]);
  const ex = explorerParams(me, speed, range);
  // The session is kept while the page is left (explorer, other mode), per scope.
  const sessionKey = `${ids.join()}|${from ?? ''}`;
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
  const [playScore, setPlayScore] = useState<PlayScore>({ lines: 0, moves: 0, asked: 0, clean: 0 });
  const onReview = (source: Source, fen: string, uci: string, grade: Grade) => review.mutate({ source, fen, uci, grade });

  if (loading || (!id && all.isLoading) || (shortening && gaps.isLoading)) return <p className="muted">Chargement…</p>;
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
            : `${title}${
                playScore.moves > 0
                  ? `${playScore.lines > 0 ? ` · ${plural(playScore.lines, 'ligne', 'lignes')}` : ''} · ${plural(playScore.moves, 'coup', 'coups')}${playScore.asked > 0 ? ` (${Math.round((100 * playScore.clean) / playScore.asked)} % du premier coup)` : ''}`
                  : ''
              }`
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
      {shortening && <ShortenNotice gaps={gaps} colors={[...new Set(sources.map((s) => s.color))]} />}

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
          chanceOf={chanceOf}
          learntElsewhere={learntElsewhere}
          sessionKey={`review|${sessionKey}`}
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
          onScore={setPlayScore}
          sessionKey={`play|${sessionKey}`}
        />
      )}

    </div>
  );
}

/** Without statistics (error), nothing is cut: says so. */
function ShortenNotice({ gaps, colors }: { gaps: ReturnType<typeof useGaps>; colors: Color[] }) {
  const reports = colors.map((c) => gaps.data?.[c]).filter((r) => !!r);
  const settings = <Link to="/settings#entrainement">Paramètres</Link>;
  if (gaps.isError || (gaps.data && !reports.length)) {
    return (
      <p className="notice error small-text">
        Statistiques indisponibles : les lignes ne sont pas raccourcies, toutes les positions sont entraînées ({settings}).
      </p>
    );
  }
  return null;
}
