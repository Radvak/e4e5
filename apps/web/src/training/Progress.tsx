import { Link } from 'react-router-dom';
import { lineText, LEECH_LAPSES, MATURE_DAYS } from './common';
import type { Source } from './useTrainingSources';
import { t } from '../i18n';

/** Per repertoire: how much is learnt, well known, due; and the positions often failed. */
export function Progress({ sources }: { sources: Source[] }) {
  const now = Date.now();
  return (
    <details className="panel progress" open>
      <summary>{t('Progrès', 'Progress')}</summary>
      <table>
        <thead>
          <tr>
            <th />
            <th title={t('Positions où c’est à vous de jouer', 'Positions where it is your move')}>Positions</th>
            <th>{t('Apprises', 'Learnt')}</th>
            <th title={t(`Prochaine révision dans ${MATURE_DAYS} jours ou plus`, `Next review in ${MATURE_DAYS} days or more`)}>{t('Bien sues', 'Well known')}</th>
            <th>{t('À revoir', 'Due')}</th>
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
              {t(<>Souvent ratées dans {s.name}</>, <>Often missed in {s.name}</>)}{' '}
              <span className="muted small-text">
                {t(
                  `(oubliées ${LEECH_LAPSES} fois ou plus après avoir été apprises)`,
                  `(forgotten ${LEECH_LAPSES} times or more after being learnt)`,
                )}
              </span>
            </h4>
            <ul>
              {leeches.map(({ p, card }) => (
                <li key={p.fen}>
                  <Link to={`/r/${s.id}?fen=${encodeURIComponent(p.fen)}`}>{lineText(p.path) || t('Position initiale', 'Starting position')}</Link>
                  <span className="muted"> · {t(`${card!.lapses} fois`, `${card!.lapses} times`)} · {s.rep.movesAt(p.fen).map((m) => m.san).join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}
