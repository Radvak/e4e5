import { Link } from 'react-router-dom';
import { lineText, LEECH_LAPSES, MATURE_DAYS } from './common';
import type { Source } from './useTrainingSources';

/** Per repertoire: how much is learnt, well known, due; and the positions often failed. */
export function Progress({ sources }: { sources: Source[] }) {
  const now = Date.now();
  return (
    <details className="panel progress" open>
      <summary>Progrès</summary>
      <table>
        <thead>
          <tr>
            <th />
            <th title="Positions où c’est à vous de jouer">Positions</th>
            <th>Apprises</th>
            <th title={`Prochaine révision dans ${MATURE_DAYS} jours ou plus`}>Bien sues</th>
            <th>À revoir</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const cards = s.positions.map((p) => s.positionCard(p.fen)).filter((c) => !!c);
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.positions.length}</td>
                <td>{cards.filter((c) => c.complete).length}</td>
                <td>{cards.filter((c) => c.interval >= MATURE_DAYS).length}</td>
                <td>{cards.filter((c) => c.due <= now).length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sources.map((s) => {
        const leeches = s.positions
          .map((p) => ({ p, card: s.positionCard(p.fen) }))
          .filter(({ card }) => card && card.lapses >= LEECH_LAPSES)
          .sort((a, b) => b.card!.lapses - a.card!.lapses);
        if (!leeches.length) return null;
        return (
          <div key={s.id} className="leeches">
            <h4>
              Souvent ratées dans {s.name}{' '}
              <span className="muted small-text">(oubliées {LEECH_LAPSES} fois ou plus après avoir été apprises)</span>
            </h4>
            <ul>
              {leeches.map(({ p, card }) => (
                <li key={p.fen}>
                  <Link to={`/r/${s.id}?fen=${encodeURIComponent(p.fen)}`}>{lineText(p.path) || 'Position initiale'}</Link>
                  <span className="muted"> · {card!.lapses} fois · {s.rep.movesAt(p.fen).map((m) => m.san).join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}
