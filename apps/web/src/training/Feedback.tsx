/**
 * How a position was answered. 'alternative': another of my moves played first (right too), then
 * the one asked, shown by its arrow.
 */
export type Outcome = 'correct' | 'new' | 'mistake' | 'shown' | 'alternative';

export function outcomeOf(isNew: boolean, mistakes: number, revealed: boolean): Outcome {
  if (isNew) return 'new';
  if (mistakes > 0) return 'mistake';
  return revealed ? 'shown' : 'correct';
}
