import { useState } from 'react';
import type { Gap } from '../api';
import { lineText, moveText } from '../chessText';
import { fmt, t } from '../i18n';
import { Button } from '../ui';

const pct = (x: number) => `${fmt(100 * x, { maximumFractionDigits: x < 0.1 ? 1 : 0 })}${t(' %', '%')}`;

/**
 * "Coups manquants": the most frequent opponent moves this repertoire does not answer yet (from the
 * gap finder), most frequent first. Tapping one plays its line on the board, ready to prepare.
 */
export function Suggestions({ gaps, fen, cutoff, pending, onOpen }: { gaps: Gap[] | undefined; fen: string; cutoff: number; pending: boolean; onOpen: (ucis: string[]) => void }) {
  const [all, setAll] = useState(false);
  if (!gaps || gaps.length === 0) return null;
  const shown = all ? gaps : gaps.slice(0, 5);
  return (
    <section className="panel suggestions">
      <h3>{t('Coups manquants', 'Missing moves')}</h3>
      {gaps.length === 0 ? (
        <p className="muted small-text">
          {t(
            <>Aucun coup adverse fréquent sans réponse (seuil : {pct(cutoff)} des parties){pending ? ' — statistiques en cours de récupération…' : '.'}</>,
            <>No frequent opponent move left unanswered (threshold: {pct(cutoff)} of the games){pending ? ' — statistics being fetched…' : '.'}</>,
          )}
        </p>
      ) : (
        <>
          <p className="muted small-text">{t('Les coups adverses les plus fréquents que ce répertoire ne prévoit pas encore.', 'The most frequent opponent moves this repertoire does not cover yet.')}</p>
          <ul className="suggestion-list">
            {shown.map((g) => {
              const ucis = g.move ? [...g.ucis, g.move.uci] : g.ucis;
              return (
                <li key={`${g.kind}|${g.fen}|${g.move?.uci ?? ''}`}>
                  <button className={`suggestion ${g.fen === fen ? 'here' : ''}`} onClick={() => onOpen(ucis)}>
                    <span className="line">
                      <span className="muted">{lineText(g.line) || t('Position initiale', 'Starting position')} </span>
                      <span className="hole-move">{g.move ? moveText(g.line, g.move.san) : t('— votre réponse ?', '— your answer?')}</span>
                      {g.fen === fen && <span className="badge warn">{t('ici', 'here')}</span>}
                    </span>
                    <span className="freq">{pct(g.prob)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {gaps.length > 5 && (
            <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
              {all ? t('Voir moins', 'See less') : t(`Voir les ${gaps.length}`, `See all ${gaps.length}`)}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
