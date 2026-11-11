import { totalGames, type Repertoire } from '@prepa-cahier/core';
import { ApiError, type Stats, type StatsMeta } from '../api';
import { rangeLabel } from '../settings';
import { RatingRange } from './RatingRange';

interface Props {
  fen: string;
  rep: Repertoire;
  stats: Stats | undefined;
  error: unknown;
  loading: boolean;
  ratings: number[];
  /** Explains where the default range comes from. */
  note: string;
  onPick: (uci: string) => void;
}

function pct(n: number, total: number) {
  return total ? (100 * n) / total : 0;
}

/** Moves played at the user's level in this position, marked when in the repertoire. */
const REASONS: Record<NonNullable<StatsMeta['reason']>, string> = {
  'no-token': 'connect Lichess in Settings to fetch live statistics',
  'rate-limited': 'Lichess rate limit, try again in a minute',
  unreachable: 'Lichess could not be reached',
};

/** Says where the numbers come from when they are not live data for the selected range. */
function provenance(meta: StatsMeta): string | null {
  const date = new Date(meta.fetchedAt).toLocaleDateString();
  const why = meta.reason ? ` (${REASONS[meta.reason]})` : '';
  if (!meta.exact) {
    return `No stored data for the selected range: showing Lichess ${meta.speeds.join('+')} games, players rated ${rangeLabel(meta.ratings)}, from ${date}${why}.`;
  }
  if (meta.reason) return `Stored data from ${date}${why}.`;
  return null;
}

export function ExplorerPanel({ fen, rep, stats, error, loading, ratings, note, onPick }: Props) {
  const data = stats?.data;
  const total = data ? totalGames(data) : 0;
  const origin = stats ? provenance(stats.meta) : null;
  const missing = error instanceof ApiError && error.status === 404;
  const missingReason = missing ? (error.body.reason as StatsMeta['reason']) : undefined;
  return (
    <section className="panel">
      <h3>
        Lichess statistics
        {data?.opening && <small> · {data.opening.eco} {data.opening.name}</small>}
      </h3>
      <RatingRange current={ratings} />
      <p className="muted small-text">
        {note} Ratings differ between sites (Chess.com ratings are usually lower than Lichess ones at
        the same strength): adjust the range to match your opponents.
      </p>
      {loading && <p className="muted">Loading…</p>}
      {origin && <p className="warning small-text">{origin}</p>}
      {missing && (
        <p className="muted">
          No statistics stored for this position{missingReason ? `: ${REASONS[missingReason]}` : ''}.
        </p>
      )}
      {Boolean(error) && !missing && <p className="error">{String(error)}</p>}
      {data && total === 0 && <p className="muted">No games in this position.</p>}
      {data && total > 0 && (
        <table className="explorer">
          <tbody>
            {data.moves.map((m) => {
              const n = totalGames(m);
              const inRep = rep.has(fen, m.uci);
              return (
                <tr key={m.uci} className={inRep ? 'in-rep' : ''} onClick={() => onPick(m.uci)} title={inRep ? 'In your repertoire' : 'Click to add'}>
                  <td className="san">{inRep ? '✓ ' : ''}{m.san}</td>
                  <td className="share">{pct(n, total).toFixed(1)}%</td>
                  <td className="games">{n.toLocaleString()}</td>
                  <td className="wdl">
                    <div className="bar">
                      <span className="w" style={{ width: `${pct(m.white, n)}%` }} />
                      <span className="d" style={{ width: `${pct(m.draws, n)}%` }} />
                      <span className="b" style={{ width: `${pct(m.black, n)}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
