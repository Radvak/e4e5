import { positionFromFen, START_FEN } from '@prepa-cahier/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type Grade, type Me } from '../api';
import { explorerParams, useSettings } from '../settings';
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

  const { newPerDay, setNewPerDay, speed, range } = useSettings();
  const ex = explorerParams(me, speed, range);
  const [mode, setModeState] = useState<Mode>(() => (localStorage.getItem('trainingMode') as Mode | null) ?? 'review');
  const setMode = (m: Mode) => {
    localStorage.setItem('trainingMode', m);
    setModeState(m);
  };
  const [counts, setCounts] = useState({ due: 0, fresh: 0, reviewed: 0, firstTry: 0 });
  const onCounts = useCallback((c: typeof counts) => setCounts(c), []);
  const onReview = (source: Source, fen: string, grade: Grade) => review.mutate({ source, fen, grade });

  if (loading || (!id && all.isLoading)) return <p>Loading…</p>;
  if (id && !sources.length) return <p className="error">Could not load the repertoire.</p>;

  const fromPath = from && sources[0] ? sources[0].positions.find((p) => p.fen === from)?.path : undefined;
  const title = id ? sources[0]!.name : 'All repertoires';

  return (
    <div className="training">
      <header className="row">
        {id ? <Link to={`/r/${id}`}>← {title}</Link> : <Link to="/">← Repertoires</Link>}
        <h2>Training{id ? '' : ': all repertoires'}</h2>
        <div className="tabs inline">
          <button className={mode === 'review' ? 'active' : ''} onClick={() => setMode('review')}>
            Review
          </button>
          <button className={mode === 'play' ? 'active' : ''} onClick={() => setMode('play')}>
            Play lines
          </button>
        </div>
        {mode === 'review' && (
          <>
            <span className="muted">
              {counts.due} due · {counts.fresh} new · {counts.reviewed} done
              {counts.reviewed > 0 && ` (${Math.round((100 * counts.firstTry) / counts.reviewed)}% first try)`}
            </span>
            <label className="muted">
              New per day{' '}
              <select value={newPerDay} onChange={(e) => setNewPerDay(Number(e.target.value))}>
                {[0, 5, 10, 20, 50].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </header>
      {from && (
        <p className="muted from">
          Only the lines after <strong>{fromPath ? lineText(fromPath) : 'this position'}</strong>.{' '}
          <button className="small" onClick={() => setParams({})}>Train everything</button>
        </p>
      )}
      {review.error && <p className="error">{review.error.message}</p>}

      {mode === 'review' ? (
        <ReviewMode
          sources={sources}
          newPerDay={newPerDay}
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
