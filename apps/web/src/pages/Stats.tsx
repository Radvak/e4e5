import type { RepMove } from '@prepa-cahier/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { BarChart, type Series } from '../components/BarChart';
import { dayStart } from '../settings';
import { lineText, MATURE_DAYS } from '../training/common';
import { useTrainingSources, type Source } from '../training/useTrainingSources';

/** Categorical slots 1-3 (blue, orange, aqua), validated on the panel surface #262421. */
const ACTIVITY: Series[] = [
  { name: 'Right first try', color: '#3987e5' },
  { name: 'Needed help', color: '#d95926' },
  { name: 'New learnt', color: '#199e70' },
];
const FORECAST: Series[] = [{ name: 'Reviews due', color: '#3987e5' }];
const DAY = 86_400_000;

const pct = (x: number) => `${Math.round(100 * x)}%`;
const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Knowledge of a set of positions: learnt share, and expected share found right now. */
function knowledge(source: Source, fens: string[]) {
  let learnt = 0;
  let recall = 0;
  let mature = 0;
  for (const fen of fens) {
    const c = source.cards.get(fen);
    if (!c) continue;
    learnt++;
    recall += c.recall;
    if (c.interval >= MATURE_DAYS) mature++;
  }
  const n = fens.length || 1;
  return { total: fens.length, learnt, mature, learntShare: learnt / n, known: recall / n, recallLearnt: learnt ? recall / learnt : 0 };
}

export function Stats() {
  const all = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const ids = useMemo(() => (all.data ?? []).map((r) => r.id), [all.data]);
  const { sources, loading } = useTrainingSources(ids, null);
  const history = useQuery({ queryKey: ['stats-history'], queryFn: () => api.statsHistory(90) });
  const [filter, setFilter] = useState<string>('all');
  const [depth, setDepth] = useState(2);

  const shown = useMemo(() => (filter === 'all' ? sources : sources.filter((s) => s.id === filter)), [sources, filter]);
  const shownIds = useMemo(() => new Set(shown.map((s) => s.id)), [shown]);

  const summary = useMemo(() => {
    let total = 0, learnt = 0, mature = 0, recall = 0, due = 0;
    const now = Date.now();
    for (const s of shown) {
      const k = knowledge(s, s.positions.map((p) => p.fen));
      total += k.total;
      learnt += k.learnt;
      mature += k.mature;
      recall += k.known * k.total;
      due += s.positions.filter((p) => {
        const c = s.cards.get(p.fen);
        return c && Date.parse(c.due) <= now;
      }).length;
    }
    return { total, learnt, mature, known: total ? recall / total : 0, recallLearnt: learnt ? recall / learnt : 0, due };
  }, [shown]);

  /** Answers per local day over the last 30 days, and the streak of training days. */
  const activity = useMemo(() => {
    const today = dayStart();
    const days = Array.from({ length: 30 }, (_, i) => today - (29 - i) * DAY);
    const counts = new Map(days.map((d) => [d, [0, 0, 0]]));
    let asked = 0, firstTry = 0;
    for (const r of history.data ?? []) {
      if (!shownIds.has(r.repertoireId)) continue;
      const d = dayStart(new Date(r.reviewedAt));
      const slot = counts.get(d);
      if (slot) {
        const k = r.isNew ? 2 : r.grade === 'again' ? 1 : 0;
        slot[k]!++;
        if (!r.isNew) {
          asked++;
          if (k === 0) firstTry++;
        }
      }
    }
    const trained = new Set((history.data ?? []).filter((r) => shownIds.has(r.repertoireId)).map((r) => dayStart(new Date(r.reviewedAt))));
    let streak = 0;
    for (let d = trained.has(today) ? today : today - DAY; trained.has(d); d -= DAY) streak++;
    const columns = days.map((d, i) => ({
      label: dayLabel(d),
      tick: i % 7 === 2 || i === 29 ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '',
      values: counts.get(d)!,
    }));
    return { columns, streak, accuracy: asked ? firstTry / asked : null, total: [...counts.values()].reduce((n, v) => n + v[0]! + v[1]! + v[2]!, 0) };
  }, [history.data, shownIds]);

  /** Reviews due per day over the next 14 days (overdue ones count today). */
  const forecast = useMemo(() => {
    const today = dayStart();
    const counts = Array.from({ length: 14 }, () => 0);
    for (const s of shown) {
      for (const p of s.positions) {
        const c = s.cards.get(p.fen);
        if (!c) continue;
        const i = Math.max(0, Math.floor((dayStart(new Date(c.due)) - today) / DAY));
        if (i < 14) counts[i]!++;
      }
    }
    return counts.map((n, i) => ({
      label: i === 0 ? 'Today (incl. overdue)' : dayLabel(today + i * DAY),
      tick: i === 0 ? 'today' : i % 2 === 0 ? new Date(today + i * DAY).toLocaleDateString(undefined, { weekday: 'short' }) : '',
      values: [n],
    }));
  }, [shown]);

  /** Positions grouped by the first `depth` moves of their line. */
  const lines = useMemo(() => {
    const groups = new Map<string, { source: Source; path: RepMove[]; fens: string[] }>();
    for (const s of shown) {
      for (const p of s.positions) {
        const head = p.path.slice(0, depth);
        const key = `${s.id}|${head.map((m) => m.uci).join(' ')}`;
        const g = groups.get(key) ?? { source: s, path: head, fens: [] };
        g.fens.push(p.fen);
        groups.set(key, g);
      }
    }
    return [...groups.values()]
      .map((g) => ({ ...g, k: knowledge(g.source, g.fens) }))
      .sort((a, b) => b.fens.length - a.fens.length);
  }, [shown, depth]);

  const weakest = useMemo(
    () =>
      shown
        .flatMap((s) => s.positions.map((p) => ({ s, p, c: s.cards.get(p.fen) })))
        // Weak: estimated recall under 90%, or forgotten at least once.
        .filter((x) => x.c && (x.c.recall < 0.9 || x.c.lapses > 0))
        .sort((a, b) => a.c!.recall - b.c!.recall || b.c!.lapses - a.c!.lapses)
        .slice(0, 10),
    [shown],
  );

  if (all.isLoading || loading) return <p>Loading…</p>;
  if (!sources.length) return <p className="muted">No repertoire yet.</p>;

  return (
    <div className="stats">
      <header className="row">
        <h2>Statistics</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Repertoire">
          <option value="all">All repertoires</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </header>

      <div className="tiles">
        <div className="tile">
          <div className="tile-value">{pct(summary.known)}</div>
          <div className="tile-label">of the repertoire known now</div>
          <div className="tile-note muted">estimated chance of finding your move, over all {summary.total} positions</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.learnt}<span className="tile-unit"> / {summary.total}</span></div>
          <div className="tile-label">positions learnt ({pct(summary.learnt / (summary.total || 1))})</div>
          <div className="tile-note muted">recall of learnt positions: {pct(summary.recallLearnt)}</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.mature}</div>
          <div className="tile-label">well known</div>
          <div className="tile-note muted">next review in {MATURE_DAYS}+ days</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.due}</div>
          <div className="tile-label">due now</div>
          <div className="tile-note">
            <Link to={filter === 'all' ? '/train' : `/r/${filter}/train`}>Train</Link>
          </div>
        </div>
        <div className="tile">
          <div className="tile-value">{activity.streak}<span className="tile-unit"> day{activity.streak === 1 ? '' : 's'}</span></div>
          <div className="tile-label">training streak</div>
          <div className="tile-note muted">
            {activity.accuracy === null ? 'no review in 30 days' : `${pct(activity.accuracy)} right first try (30 days)`}
          </div>
        </div>
      </div>

      <section className="panel">
        <BarChart title="Training activity, last 30 days" series={ACTIVITY} columns={activity.columns} unit="answers" />
        {activity.total === 0 && <p className="muted small-text">History is recorded from now on: train to fill this chart.</p>}
      </section>

      <section className="panel">
        <BarChart title="Reviews coming, next 14 days" series={FORECAST} columns={forecast} unit="reviews" />
      </section>

      <section className="panel">
        <div className="row">
          <h3>By line</h3>
          <label className="muted">
            grouped by the first{' '}
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {[1, 2, 3, 4, 6].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>{' '}
            moves
          </label>
        </div>
        <table className="lines">
          <thead>
            <tr>
              <th>Line</th>
              <th>Positions</th>
              <th>Learnt</th>
              <th>Known now</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((g) => {
              const fen = g.path.at(-1)?.toFen;
              return (
                <tr key={`${g.source.id}|${g.path.map((m) => m.uci).join(' ')}`}>
                  <td>
                    {shown.length > 1 && <span className="muted">{g.source.name} · </span>}
                    {fen ? (
                      <Link to={`/r/${g.source.id}?fen=${encodeURIComponent(fen)}`}>{lineText(g.path)}</Link>
                    ) : (
                      'Initial position'
                    )}
                  </td>
                  <td>{g.k.total}</td>
                  <td>{pct(g.k.learntShare)}</td>
                  <td className="meter-cell">
                    <span className="meter" title={`${pct(g.k.known)} known now`}>
                      <span style={{ width: pct(g.k.known) }} />
                    </span>
                    {pct(g.k.known)}
                  </td>
                  <td>
                    {fen && (
                      <Link className="small-text" to={`/r/${g.source.id}/train?from=${encodeURIComponent(fen)}`}>
                        train
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Weakest positions</h3>
        {weakest.length === 0 && (
          <p className="muted">None for now: every learnt position has an estimated recall of 90% or more.</p>
        )}
        {weakest.length > 0 && (
          <ul className="weakest">
            {weakest.map(({ s, p, c }) => (
              <li key={`${s.id}|${p.fen}`}>
                <Link to={`/r/${s.id}?fen=${encodeURIComponent(p.fen)}`}>{lineText(p.path) || 'Initial position'}</Link>
                <span className="muted">
                  {' '}· {s.rep.movesAt(p.fen).map((m) => m.san).join(', ')} · {pct(c!.recall)} recall
                  {c!.lapses > 0 && ` · forgotten ${c!.lapses}×`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
