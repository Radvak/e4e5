import type { Color } from '@e4e5/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type GamesReport, type RepertoireSummary, type Results } from '../api';
import { GameSyncInline, useGameSync } from '../components/GameSync';
import { fmt, t } from '../i18n';
import { SPEED_NAMES, useSettings } from '../settings';
import { Button, EmptyState, PageHeader, plural } from '../ui';

const PERIOD: Record<number, string> = t(
  { 30: '30 derniers jours', 90: '3 derniers mois', 365: '12 derniers mois', 0: 'toutes les parties' },
  { 30: 'last 30 days', 90: 'last 3 months', 365: 'last 12 months', 0: 'all games' },
);
const pct = (x: number) => t(`${Math.round(100 * x)} %`, `${Math.round(100 * x)}%`);
const score = (r: Results) => {
  const n = r.win + r.draw + r.loss;
  return n ? (r.win + r.draw / 2) / n : 0;
};

/**
 * The games compared with the repertoires (period and speeds of the settings). Shared by this
 * page, the Lacunes page (my errors) and its badge (same query, computed once).
 */
export function useGamesReport() {
  const { gamesDays, gamesSpeeds } = useSettings();
  const { state, running } = useGameSync();
  // The games stored: a sync that brought new ones gives a new report (not the cached one).
  const stored = Object.values(state?.counts ?? {}).reduce((a, b) => a + b, 0);
  return useQuery({
    queryKey: ['games-report', gamesDays, gamesSpeeds, running, stored],
    queryFn: () => api.gamesReport(gamesDays, gamesSpeeds),
    enabled: !running,
    staleTime: 60_000,
  });
}

/** Mes parties: score per repertoire, and the first moves outside the repertoires (my errors are in Lacunes). */
export function Games() {
  const { gamesDays, gamesSpeeds } = useSettings();
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const report = useGamesReport();
  const byId = new Map((reps.data ?? []).map((r) => [r.id, r]));
  const r = report.data;

  return (
    <div className="games-page stack">
      <PageHeader
        title={t('Mes parties', 'My games')}
        subtitle={
          <Link to="/settings#games" title={t('Changer dans les paramètres', 'Change in the settings')} className="muted">
            {r ? `${t(plural(r.games, 'partie', 'parties'), plural(r.games, 'game', 'games'))} · ` : ''}
            {PERIOD[gamesDays] ?? t(`${gamesDays} jours`, `${gamesDays} days`)} · {gamesSpeeds.map((s) => SPEED_NAMES[s] ?? s).join(', ')}
          </Link>
        }
      />
      <GameSyncInline />

      {report.isLoading && <p className="muted">{t('Analyse de vos parties…', 'Analysing your games…')}</p>}
      {report.error && <p className="error">{String(report.error)}</p>}
      {r && r.games === 0 && (
        <EmptyState title={t('Aucune partie', 'No games')} action={<Button to="/settings#games">{t('Paramètres des parties', 'Game settings')}</Button>}>
          {t(
            'Importez vos parties Chess.com ou Lichess, ou élargissez la période et les cadences.',
            'Import your Chess.com or Lichess games, or widen the period and the speeds.',
          )}
        </EmptyState>
      )}

      {r && r.games > 0 && (
        <>
          <p className="muted small-text" style={{ margin: 0 }}>
            {r.inbox.errorCount > 0 ? (
              t(
                <>
                  Vos écarts au répertoire ({r.inbox.errorCount}) sont dans les <Link to="/gaps">Lacunes</Link>, avec les positions fragiles de
                  l’entraînement.
                </>,
                <>
                  Your deviations from the repertoire ({r.inbox.errorCount}) are in <Link to="/gaps">Gaps</Link>, with the fragile positions of
                  your training.
                </>,
              )
            ) : (
              t('Aucun écart à votre répertoire dans ces parties.', 'No deviation from your repertoire in these games.')
            )}
          </p>
          <RepertoireStats report={r} reps={byId} />
        </>
      )}
    </div>
  );
}

function ResultBar({ results }: { results: Results }) {
  const n = results.win + results.draw + results.loss || 1;
  return (
    <span className="result-bar" title={t(`${results.win} gagnées · ${results.draw} nulles · ${results.loss} perdues`, `${results.win} won · ${results.draw} drawn · ${results.loss} lost`)}>
      <span className="win" style={{ width: `${(100 * results.win) / n}%` }} />
      <span className="draw" style={{ width: `${(100 * results.draw) / n}%` }} />
      <span className="loss" style={{ width: `${(100 * results.loss) / n}%` }} />
    </span>
  );
}

const OPENINGS_SHOWN = 8;

/** Score per named opening and colour; a click shows its variations. */

function RepertoireStats({ report, reps }: { report: GamesReport; reps: Map<string, RepertoireSummary> }) {
  const rows = report.repertoires.filter((x) => x.games > 0).sort((a, b) => b.games - a.games);
  const colors: Color[] = ['white', 'black'];
  return (
    <section className="card">
      <h3>{t('Par répertoire', 'By repertoire')}</h3>
      <div className="table-wrap">
        <table className="lines">
          <thead>
            <tr>
              <th />
              <th>{t('Parties', 'Games')}</th>
              <th>Score</th>
              <th title={t('Nombre moyen de coups joués dans votre préparation', 'Average number of moves played within your preparation')}>{t('Dans la théorie', 'In book')}</th>
            </tr>
          </thead>
          {colors.map((color) => {
            const own = rows.filter((x) => reps.get(x.id)?.color === color);
            const out = report.outside.filter((o) => o.color === color);
            if (!own.length && !out.length) return null;
            return (
              <tbody key={color}>
                {own.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <span className={`dot ${color}`} /> <Link to={`/r/${x.id}`}>{reps.get(x.id)?.name}</Link>
                    </td>
                    <td>{x.games}</td>
                    <td className="meter-cell">
                      {pct(score(x.results))} <ResultBar results={x.results} />
                    </td>
                    <td>
                      {fmt(x.bookMoves, { maximumFractionDigits: 1 })} {t('coups', 'moves')}
                    </td>
                  </tr>
                ))}
                {out.slice(0, 4).map((o) => (
                  <tr key={o.move} className="muted">
                    <td title={t('Vous avez joué un autre premier coup que dans vos répertoires', 'You played another first move than in your repertoires')}>
                      <span className={`dot ${color}`} /> {t('hors répertoire :', 'outside repertoire:')} {o.move}
                    </td>
                    <td>{o.games}</td>
                    <td className="meter-cell">
                      {pct(score(o.results))} <ResultBar results={o.results} />
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}


