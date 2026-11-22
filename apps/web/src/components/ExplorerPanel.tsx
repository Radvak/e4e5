import type { Color, PlayedMove } from '@tabiya/core';
import { ApiError, type BestMovesResponse, type Stats, type StatsMeta } from '../api';
import { rangeLabel, speedsLabel } from '../settings';
import { LevelTable } from './LevelTable';

interface Props {
  fen: string;
  /** Scores from this side (the repertoire's colour, or the side to move). */
  color: Color;
  /** Marked as prepared (green). */
  inRep: (uci: string) => boolean;
  /** PGN annotations of a move of my repertoires here (!, ?, …): the move is coloured. */
  nagsOf?: (uci: string) => readonly number[] | null | undefined;
  stats: Stats | undefined;
  error: unknown;
  loading: boolean;
  onPick: (uci: string) => void;
  /** Missing moves (gap finder): in orange. */
  isMissing?: (uci: string) => boolean;
  /** Ply count of the position (for move numbers). */
  firstMoveNumber: number;
  onPlay: (moves: PlayedMove[]) => void;
  /** The search at my level merged into the table (see LevelTable). */
  level: {
    data: BestMovesResponse | undefined;
    loading: boolean;
    error: Error | null;
    depth: number;
    maxDepth: number;
    onDepth: (d: number) => void;
    /** My turn (else the opponent's moves are scored for me, the search starting after each). */
    myTurn: boolean;
    range: string;
    engineBest?: string;
  };
}

export const REASONS: Record<NonNullable<StatsMeta['reason']>, string> = {
  'no-token': 'liez Lichess dans les paramètres pour des statistiques à jour',
  'rate-limited': 'limite de Lichess atteinte, réessayez dans une minute',
  unreachable: 'Lichess est injoignable',
};

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "octobre 2026", "août 2026 – octobre 2026". */
const periodLabel = (p: NonNullable<StatsMeta['period']>) => (p.since === p.until ? monthLabel(p.since) : `${monthLabel(p.since)} – ${monthLabel(p.until)}`);

/**
 * Says where the numbers come from: the months of games counted (so they differ from the Lichess
 * site, which counts every game), and when they are not live data for the selected range.
 */
function provenance(meta: StatsMeta): string | null {
  const date = new Date(meta.fetchedAt).toLocaleDateString('fr-FR');
  const why = meta.reason ? ` (${REASONS[meta.reason]})` : '';
  if (!meta.exact) {
    return `Pas de données pour votre tranche : parties Lichess ${speedsLabel(meta.speeds)} de joueurs ${rangeLabel(meta.ratings)}, du ${date}${why}.`;
  }
  if (meta.reason) return `Données enregistrées le ${date}${why}.`;
  if (meta.period) return `Parties Lichess : ${periodLabel(meta.period)}.`;
  return null;
}

/**
 * Moves played at the user's level in this position, merged with the search at my level (see
 * LevelTable), marked when in the repertoire. Under the board, like the engine lines.
 */
export function ExplorerPanel({ fen, color, inRep, nagsOf, stats, error, loading, onPick, isMissing, firstMoveNumber, onPlay, level }: Props) {
  const data = stats?.data;
  const origin = stats ? provenance(stats.meta) : null;
  const missing = error instanceof ApiError && error.status === 404;
  const missingReason = missing ? (error.body.reason as StatsMeta['reason']) : undefined;
  // Under the board like the engine lines: no heading, the notes in small.
  return (
    <div className="level-lines level-table">
      {loading && <div className="level-status muted">Chargement…</div>}
      {missing && <div className="level-status muted">Aucune statistique pour cette position{missingReason ? ` : ${REASONS[missingReason]}` : ''}.</div>}
      {Boolean(error) && !missing && <div className="level-status error">{String(error)}</div>}
      {data && (
        <LevelTable
          data={data}
          fen={fen}
          color={color}
          firstMoveNumber={firstMoveNumber}
          inRep={inRep}
          nagsOf={nagsOf}
          onPick={onPick}
          onPlay={onPlay}
          missing={isMissing}
          level={level.data}
          depth={level.depth}
          maxDepth={level.maxDepth}
          onDepth={level.onDepth}
          myTurn={level.myTurn}
          levelLoading={level.loading}
          levelError={level.error}
          range={level.range}
          engineBest={level.engineBest}
        />
      )}
      {origin && <p className="warning small-text level-origin">{origin}</p>}
    </div>
  );
}
