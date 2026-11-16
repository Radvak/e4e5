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
  { name: 'Juste du premier coup', color: '#3987e5' },
  { name: 'Avec une erreur', color: '#d95926' },
  { name: 'Nouvelles apprises', color: '#199e70' },
];
const FORECAST: Series[] = [{ name: 'Révisions prévues', color: '#3987e5' }];
const DAY = 86_400_000;

const pct = (x: number) => `${Math.round(100 * x)} %`;
const dayLabel = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Knowledge of a set of positions: learnt share, and expected share found right now. */
function knowledge(source: Source, fens: string[]) {
  let learnt = 0;
  let recall = 0;
  let mature = 0;
  for (const fen of fens) {
    const c = source.positionCard(fen);
    if (!c) continue;
    if (c.complete) learnt++;
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
        const c = s.positionCard(p.fen);
        return c && c.due <= now;
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
      tick: i % 7 === 2 || i === 29 ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '',
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
        const c = s.positionCard(p.fen);
        if (!c) continue;
        const i = Math.max(0, Math.floor((dayStart(new Date(c.due)) - today) / DAY));
        if (i < 14) counts[i]!++;
      }
    }
    return counts.map((n, i) => ({
      label: i === 0 ? 'Aujourd’hui (retards compris)' : dayLabel(today + i * DAY),
      tick: i === 0 ? 'auj.' : i % 2 === 0 ? new Date(today + i * DAY).toLocaleDateString('fr-FR', { weekday: 'short' }) : '',
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
        .flatMap((s) => s.positions.map((p) => ({ s, p, c: s.positionCard(p.fen) })))
        // Weak: estimated recall under 90%, or forgotten at least once.
        .filter((x) => x.c && (x.c.recall < 0.9 || x.c.lapses > 0))
        .sort((a, b) => a.c!.recall - b.c!.recall || b.c!.lapses - a.c!.lapses)
        .slice(0, 10),
    [shown],
  );

  if (all.isLoading || loading) return <p className="muted">Chargement…</p>;
  if (!sources.length) return <p className="muted">Aucun répertoire.</p>;

  return (
    <div className="stats stack">
      <header className="row">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Répertoire">
          <option value="all">Tous les répertoires</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </header>

      <div className="tiles">
        <div className="tile">
          <div className="tile-value">{pct(summary.known)}</div>
          <div className="tile-label">du répertoire su aujourd’hui</div>
          <div className="tile-note muted">chance estimée de trouver votre coup, sur les {summary.total} positions</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.learnt}<span className="tile-unit"> / {summary.total}</span></div>
          <div className="tile-label">positions apprises ({pct(summary.learnt / (summary.total || 1))})</div>
          <div className="tile-note muted">mémorisation des positions apprises : {pct(summary.recallLearnt)}</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.mature}</div>
          <div className="tile-label">bien sues</div>
          <div className="tile-note muted">prochaine révision dans {MATURE_DAYS} jours ou plus</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.due}</div>
          <div className="tile-label">à revoir</div>
          <div className="tile-note">
            <Link to={filter === 'all' ? '/train' : `/r/${filter}/train`}>S’entraîner</Link>
          </div>
        </div>
        <div className="tile">
          <div className="tile-value">{activity.streak}<span className="tile-unit"> jour{activity.streak > 1 ? 's' : ''}</span></div>
          <div className="tile-label">de suite</div>
          <div className="tile-note muted">
            {activity.accuracy === null ? 'aucune révision en 30 jours' : `${pct(activity.accuracy)} justes du premier coup (30 jours)`}
          </div>
        </div>
      </div>

      <section className="panel">
        <BarChart title="Activité, 30 derniers jours" series={ACTIVITY} columns={activity.columns} unit="réponses" />
        {activity.total === 0 && <p className="muted small-text">L’historique est enregistré à partir de maintenant : entraînez-vous pour remplir ce graphique.</p>}
      </section>

      <section className="panel">
        <BarChart title="Révisions à venir, 14 prochains jours" series={FORECAST} columns={forecast} unit="révisions" />
      </section>

      <section className="panel">
        <div className="row">
          <h3>Par ligne</h3>
          <label className="muted">
            selon les{' '}
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {[1, 2, 3, 4, 6].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>{' '}
            premiers coups
          </label>
        </div>
        <div className="table-wrap"><table className="lines">
          <thead>
            <tr>
              <th>Ligne</th>
              <th>Positions</th>
              <th>Apprises</th>
              <th>Sues</th>
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
                      'Position initiale'
                    )}
                  </td>
                  <td>{g.k.total}</td>
                  <td>{pct(g.k.learntShare)}</td>
                  <td className="meter-cell">
                    <span className="meter" title={`${pct(g.k.known)} sues aujourd’hui`}>
                      <span style={{ width: pct(g.k.known) }} />
                    </span>
                    {pct(g.k.known)}
                  </td>
                  <td>
                    {fen && (
                      <Link className="small-text" to={`/r/${g.source.id}/train?from=${encodeURIComponent(fen)}`}>
                        s’entraîner
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>

      <section className="panel">
        <h3>Positions les plus fragiles</h3>
        {weakest.length === 0 && (
          <p className="muted">Aucune pour l’instant : chaque position apprise a une mémorisation estimée d’au moins 90 %.</p>
        )}
        {weakest.length > 0 && (
          <ul className="weakest">
            {weakest.map(({ s, p, c }) => (
              <li key={`${s.id}|${p.fen}`}>
                <Link to={`/r/${s.id}?fen=${encodeURIComponent(p.fen)}`}>{lineText(p.path) || 'Position initiale'}</Link>
                <span className="muted">
                  {' '}· {s.rep.movesAt(p.fen).map((m) => m.san).join(', ')} · {pct(c!.recall)} de mémorisation
                  {c!.lapses > 0 && ` · oubliée ${c!.lapses} fois`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
