import type { Repertoire } from '@prepa-cahier/core';
import { ApiError, type Me, type Stats, type StatsMeta } from '../api';
import { rangeLabel, speedsLabel } from '../settings';
import { MoveTable } from './MoveTable';
import { StatsSource } from './StatsSource';

interface Props {
  me: Me;
  fen: string;
  rep: Repertoire;
  stats: Stats | undefined;
  error: unknown;
  loading: boolean;
  onPick: (uci: string) => void;
  /** Hide the heading (when the panel sits under a tab named after it). */
  bare?: boolean;
}

export const REASONS: Record<NonNullable<StatsMeta['reason']>, string> = {
  'no-token': 'liez Lichess dans les paramètres pour des statistiques à jour',
  'rate-limited': 'limite de Lichess atteinte, réessayez dans une minute',
  unreachable: 'Lichess est injoignable',
};

/** Says where the numbers come from when they are not live data for the selected range. */
function provenance(meta: StatsMeta): string | null {
  const date = new Date(meta.fetchedAt).toLocaleDateString('fr-FR');
  const why = meta.reason ? ` (${REASONS[meta.reason]})` : '';
  if (!meta.exact) {
    return `Pas de données pour votre tranche : parties Lichess ${speedsLabel(meta.speeds)} de joueurs ${rangeLabel(meta.ratings)}, du ${date}${why}.`;
  }
  if (meta.reason) return `Données enregistrées le ${date}${why}.`;
  return null;
}

/** Moves played at the user's level in this position, marked when in the repertoire. */
export function ExplorerPanel({ me, fen, rep, stats, error, loading, onPick, bare }: Props) {
  const data = stats?.data;
  const origin = stats ? provenance(stats.meta) : null;
  const missing = error instanceof ApiError && error.status === 404;
  const missingReason = missing ? (error.body.reason as StatsMeta['reason']) : undefined;
  const body = (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <StatsSource me={me} />
        {data?.opening && <span className="muted small-text" style={{ margin: 0 }}>{data.opening.eco} · {data.opening.name}</span>}
      </div>
      {loading && <p className="muted">Chargement…</p>}
      {origin && <p className="warning small-text">{origin}</p>}
      {missing && <p className="muted">Aucune statistique pour cette position{missingReason ? ` : ${REASONS[missingReason]}` : ''}.</p>}
      {Boolean(error) && !missing && <p className="error">{String(error)}</p>}
      {data && <MoveTable data={data} inRep={(uci) => rep.has(fen, uci)} onPick={onPick} />}
    </>
  );
  if (bare) return body;
  return (
    <section className="panel">
      <h3>Statistiques Lichess</h3>
      {body}
    </section>
  );
}
