import { totalGames, type ExplorerResponse } from '@prepa-cahier/core';

function pct(n: number, total: number) {
  return total ? (100 * n) / total : 0;
}

/** One row per move: share, games, win/draw/loss bar. Moves in the repertoire are marked. */
export function MoveTable({ data, inRep, onPick }: { data: ExplorerResponse; inRep: (uci: string) => boolean; onPick: (uci: string) => void }) {
  const total = totalGames(data);
  if (total === 0) return <p className="muted">No games in this position.</p>;
  return (
    <table className="explorer">
      <tbody>
        {data.moves.map((m) => {
          const n = totalGames(m);
          const prepared = inRep(m.uci);
          return (
            <tr key={m.uci} className={prepared ? 'in-rep' : ''} onClick={() => onPick(m.uci)} title={prepared ? 'In your repertoire' : 'Play this move'}>
              <td className="san">{prepared ? '✓ ' : ''}{m.san}</td>
              <td className="share">{pct(n, total).toFixed(1)}%</td>
              <td className="games">{n.toLocaleString()}</td>
              <td className="wdl">
                <div className="bar" title={`White ${pct(m.white, n).toFixed(0)}% · draws ${pct(m.draws, n).toFixed(0)}% · Black ${pct(m.black, n).toFixed(0)}%`}>
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
  );
}
