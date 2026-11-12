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
            New move learnt: <strong>{played.san}</strong> <span className="muted">· it will come back in a minute</span>
          </span>
        )}
        {(outcome === 'mistake' || outcome === 'shown') && (
          <span>
            <strong className="warning">{played.san}</strong>
            <span className="muted">
              {' '}· found {outcome === 'mistake' ? 'after a mistake' : 'with the answer shown'}, it will come back soon
            </span>
          </span>
        )}
        {others.length > 0 && <span className="muted"> · also in your repertoire: {others.map((m) => m.san).join(', ')}</span>}
      </p>
      {played.comment && <p className="comment">{played.comment}</p>}
    </section>
  );
}
