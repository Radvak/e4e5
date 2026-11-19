import type { Color, PlayedMove } from '@tabiya/core';
import { ApiError, type BestMovesResponse, type Stats, type StatsMeta } from '../api';
import { rangeLabel, speedsLabel } from '../settings';
import { LevelTable } from './LevelTable';

interface Props {
  fen: string;
  /** Scores from this side (the repertoire's colour, or the side to move). */
  color: Color;
  /** Marked as prepared (✓). */
  inRep: (uci: string) => boolean;
  /** PGN annotations of a move of my repertoires here (!, ?, …): the move is coloured. */
  nagsOf?: (uci: string) => readonly number[] | null | undefined;
  stats: Stats | undefined;
  error: unknown;
  loading: boolean;
  onPick: (uci: string) => void;
  /** Show popular moves missing from the repertoire in orange (default: yes). */
  markPopular?: boolean;
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
    canSearch: boolean;
    range: string;
    engineBest?: string;
  };
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

/**
 * Moves played at the user's level in this position, merged with the search at my level (see
 * LevelTable), marked when in the repertoire. Under the board, like the engine lines.
 */
export function ExplorerPanel({ fen, color, inRep, nagsOf, stats, error, loading, onPick, markPopular = true, firstMoveNumber, onPlay, level }: Props) {
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
          markPopular={markPopular}
          level={level.data}
          depth={level.depth}
          maxDepth={level.maxDepth}
          onDepth={level.onDepth}
          canSearch={level.canSearch}
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
