import type { RepMove } from '@prepa-cahier/core';

/** How a position was answered. */
export type Outcome = 'correct' | 'new' | 'mistake' | 'shown';

export interface Feedback {
  played: RepMove;
  /** Other repertoire moves in that position. */
  others: RepMove[];
  outcome: Outcome;
}

export function outcomeOf(isNew: boolean, mistakes: number, revealed: boolean): Outcome {
  if (isNew) return 'new';
  if (mistakes > 0) return 'mistake';
  return revealed ? 'shown' : 'correct';
}

/** Recap of the previous answer, with the move's comment. */
export function FeedbackPanel({ played, others, outcome }: Feedback) {
  return (
    <section className="panel feedback">
      <p>
        {outcome === 'correct' && <span className="success">✓ {played.san}</span>}
        {outcome === 'new' && (
          <span>
            Nouveau coup appris : <strong>{played.san}</strong> <span className="muted">· il reviendra dans une minute</span>
          </span>
        )}
        {(outcome === 'mistake' || outcome === 'shown') && (
          <span>
            <strong className="warning">{played.san}</strong>
            <span className="muted">
              {' '}· trouvé {outcome === 'mistake' ? 'après une erreur' : 'avec la réponse affichée'}, il reviendra bientôt
            </span>
          </span>
        )}
        {others.length > 0 && <span className="muted"> · aussi dans votre répertoire : {others.map((m) => m.san).join(', ')}</span>}
      </p>
      {played.comment && <p className="comment">{played.comment}</p>}
    </section>
  );
}
