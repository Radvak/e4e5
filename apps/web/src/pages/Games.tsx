import type { Color } from '@tabiya/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type GamesReport, type RepertoireSummary, type Results } from '../api';
import { GameSyncInline, useGameSync } from '../components/GameSync';
import { SPEED_NAMES, useSettings } from '../settings';
import { Button, EmptyState, PageHeader, plural } from '../ui';

const PERIOD: Record<number, string> = { 30: '30 derniers jours', 90: '3 derniers mois', 365: '12 derniers mois', 0: 'toutes les parties' };
const pct = (x: number) => `${Math.round(100 * x)} %`;
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
  const { running } = useGameSync();
  return useQuery({
    queryKey: ['games-report', gamesDays, gamesSpeeds, running],
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
        title="Mes parties"
        subtitle={
          <Link to="/settings#parties" title="Changer dans les paramètres" className="muted">
            {r ? `${plural(r.games, 'partie', 'parties')} · ` : ''}
            {PERIOD[gamesDays] ?? `${gamesDays} jours`} · {gamesSpeeds.map((s) => SPEED_NAMES[s] ?? s).join(', ')}
          </Link>
        }
      />
      <GameSyncInline />

      {report.isLoading && <p className="muted">Analyse de vos parties…</p>}
      {report.error && <p className="error">{String(report.error)}</p>}
      {r && r.games === 0 && (
        <EmptyState title="Aucune partie" action={<Button to="/settings#parties">Paramètres des parties</Button>}>
          Importez vos parties Chess.com ou Lichess, ou élargissez la période et les cadences.
        </EmptyState>
      )}

      {r && r.games > 0 && (
        <>
          <p className="muted small-text" style={{ margin: 0 }}>
            {r.inbox.errorCount > 0 ? (
              <>
                Vos écarts au répertoire ({r.inbox.errorCount}) sont dans les <Link to="/lacunes">Lacunes</Link>, avec les positions fragiles de
                l’entraînement.
              </>
            ) : (
              <>Aucun écart à votre répertoire dans ces parties.</>
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
    <span className="result-bar" title={`${results.win} gagnées · ${results.draw} nulles · ${results.loss} perdues`}>
      <span className="win" style={{ width: pct(results.win / n) }} />
      <span className="draw" style={{ width: pct(results.draw / n) }} />
      <span className="loss" style={{ width: pct(results.loss / n) }} />
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
      <h3>Par répertoire</h3>
      <div className="table-wrap">
        <table className="lines">
          <thead>
            <tr>
              <th />
              <th>Parties</th>
              <th>Score</th>
              <th title="Nombre moyen de coups joués dans votre préparation">Dans la théorie</th>
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
                    <td>{x.bookMoves.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} coups</td>
                  </tr>
                ))}
                {out.slice(0, 4).map((o) => (
                  <tr key={o.move} className="muted">
                    <td title="Vous avez joué un autre premier coup que dans vos répertoires">
                      <span className={`dot ${color}`} /> hors répertoire : {o.move}
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


