import { totalGames, type ExplorerResponse } from '@tabiya/core';
import { isPopular } from './arrows';

function pct(n: number, total: number) {
  return total ? (100 * n) / total : 0;
}

/**
 * One row per move: share, games, win/draw/loss bar. Moves in the repertoire are marked.
 * `limit`: only the most played moves, plus the repertoire moves played less often.
 */
export function MoveTable({ data, inRep, onPick, limit, markPopular = true }: { data: ExplorerResponse; inRep: (uci: string) => boolean; onPick: (uci: string) => void; limit?: number; markPopular?: boolean }) {
  const total = totalGames(data);
  if (total === 0) return <p className="muted">Aucune partie dans cette position.</p>;
  const moves = limit ? data.moves.filter((m, i) => i < limit || inRep(m.uci)) : data.moves;
  return (
    <table className="explorer">
      <tbody>
        {moves.map((m) => {
          const n = totalGames(m);
          const prepared = inRep(m.uci);
          // Same colours as the arrows: green in the repertoire, orange popular but missing.
          const popular = markPopular && !prepared && isPopular(data.moves.indexOf(m), n / total);
          return (
            <tr
              key={m.uci}
              className={prepared ? 'in-rep' : popular ? 'popular' : ''}
              onClick={() => onPick(m.uci)}
              title={prepared ? 'Dans votre répertoire' : popular ? 'Joué souvent, pas dans votre répertoire' : 'Jouer ce coup'}
            >
              <td className="san">{prepared ? '✓ ' : ''}{m.san}</td>
              <td className="share">{pct(n, total).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</td>
              <td className="games">{n.toLocaleString('fr-FR')}</td>
              <td className="wdl">
                <div className="bar" title={`Blancs ${pct(m.white, n).toFixed(0)} % · nulles ${pct(m.draws, n).toFixed(0)} % · Noirs ${pct(m.black, n).toFixed(0)} %`}>
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
