import { Link } from 'react-router-dom';
import { lineText, LEECH_LAPSES, MATURE_DAYS } from './common';
import type { Source } from './useTrainingSources';

/** Per repertoire: how much is learnt, well known, due; and the positions often failed. */
export function Progress({ sources }: { sources: Source[] }) {
  const now = Date.now();
  return (
    <details className="panel progress" open>
      <summary>Progress</summary>
      <table>
        <thead>
          <tr>
            <th />
            <th title="Positions where it is your turn">Positions</th>
            <th>Learnt</th>
            <th title={`Next review in ${MATURE_DAYS}+ days`}>Well known</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const cards = s.positions.map((p) => s.cards.get(p.fen)).filter((c) => !!c);
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.positions.length}</td>
                <td>{cards.length}</td>
                <td>{cards.filter((c) => c.interval >= MATURE_DAYS).length}</td>
                <td>{cards.filter((c) => Date.parse(c.due) <= now).length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sources.map((s) => {
        const leeches = s.positions
          .map((p) => ({ p, card: s.cards.get(p.fen) }))
          .filter(({ card }) => card && card.lapses >= LEECH_LAPSES)
          .sort((a, b) => b.card!.lapses - a.card!.lapses);
        if (!leeches.length) return null;
        return (
          <div key={s.id} className="leeches">
            <h4>
              Often failed in {s.name}{' '}
              <span className="muted small-text">(forgotten {LEECH_LAPSES}+ times after being learnt)</span>
            </h4>
            <ul>
              {leeches.map(({ p, card }) => (
                <li key={p.fen}>
                  <Link to={`/r/${s.id}?fen=${encodeURIComponent(p.fen)}`}>{lineText(p.path) || 'Initial position'}</Link>
                  <span className="muted"> · {card!.lapses}× · {s.rep.movesAt(p.fen).map((m) => m.san).join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}
