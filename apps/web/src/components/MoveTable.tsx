import { totalGames, type Color, type ExplorerResponse } from '@tabiya/core';
import { Fragment, useState, type ReactNode } from 'react';
import { Icon } from '../ui';
import { San } from './Nag';
import { WdlBar } from './WdlBar';

function pct(n: number, total: number) {
  return total ? (100 * n) / total : 0;
}

/**
 * One row per move: games (share in brackets), win/draw/loss bar. Moves in the repertoire are marked.
 * `limit`: only the most played moves, plus the repertoire moves played less often. `detail`: what
 * a row unfolds into (chevron), e.g. the games with that move.
 */
export function MoveTable({ data, color = 'white', inRep, nagsOf, onPick, limit, missing, detail }: { data: ExplorerResponse; /** My side (the board's orientation): the bars from it. */ color?: Color; inRep: (uci: string) => boolean; nagsOf?: (uci: string) => readonly number[] | null | undefined; onPick: (uci: string) => void; limit?: number; missing?: (uci: string) => boolean; detail?: (uci: string) => ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const total = totalGames(data);
  if (total === 0) return <p className="muted">Aucune partie dans cette position.</p>;
  const moves = limit ? data.moves.filter((m, i) => i < limit || inRep(m.uci)) : data.moves;
  return (
    <table className="explorer">
      <tbody>
        {moves.map((m) => {
          const n = totalGames(m);
          const prepared = inRep(m.uci);
          // Same colours as the arrows: green in the repertoire, orange a missing move (gap finder).
          const popular = !prepared && !!missing?.(m.uci);
          const isOpen = !!detail && open === m.uci;
          return (
            <Fragment key={m.uci}>
            <tr
              className={prepared ? 'in-rep' : popular ? 'popular' : ''}
              onClick={() => onPick(m.uci)}
              title={prepared ? 'Dans votre répertoire' : popular ? 'Coup manquant : joué souvent, pas encore dans votre répertoire' : 'Jouer ce coup'}
            >
              <td className="san">
                <San san={m.san} nags={nagsOf?.(m.uci)} />
              </td>
              <td className="games">
                {n.toLocaleString('fr-FR')}{' '}
                <span className="share">({pct(n, total).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %)</span>
              </td>
              <td className="wdl">
                <WdlBar white={m.white} draws={m.draws} black={m.black} color={color} />
              </td>
              {detail && (
                <td className="unfold-col" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`unfold ${isOpen ? 'open' : ''}`}
                    onClick={() => setOpen(isOpen ? null : m.uci)}
                    title={isOpen ? 'Masquer les parties' : 'Voir les parties avec ce coup'}
                    aria-expanded={isOpen}
                  >
                    <Icon name="chevron" size={16} />
                  </button>
                </td>
              )}
            </tr>
            {isOpen && (
              <tr className="move-detail">
                <td colSpan={4}>{detail!(m.uci)}</td>
              </tr>
            )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
