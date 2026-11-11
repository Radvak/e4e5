import { totalGames, type ExplorerResponse, type Repertoire } from '@prepa-cahier/core';
import { ApiError } from '../api';

interface Props {
  fen: string;
  rep: Repertoire;
  data: ExplorerResponse | undefined;
  error: unknown;
  loading: boolean;
  label: string;
  onPick: (uci: string) => void;
}

function pct(n: number, total: number) {
  return total ? (100 * n) / total : 0;
}

/** Moves played at the user's level in this position, marked when in the repertoire. */
export function ExplorerPanel({ fen, rep, data, error, loading, label, onPick }: Props) {
  const total = data ? totalGames(data) : 0;
  return (
    <section className="panel">
      <h3>
        Lichess players {label}
        {data?.opening && <small> · {data.opening.eco} {data.opening.name}</small>}
      </h3>
      {loading && <p className="muted">Loading…</p>}
      {error instanceof ApiError && error.status === 503 && <p className="muted">Lichess rate limit, retry in a minute.</p>}
      {Boolean(error) && !(error instanceof ApiError && error.status === 503) && <p className="error">{String(error)}</p>}
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
