/** How a position was answered. */
export type Outcome = 'correct' | 'new' | 'mistake' | 'shown';

export function outcomeOf(isNew: boolean, mistakes: number, revealed: boolean): Outcome {
  if (isNew) return 'new';
  if (mistakes > 0) return 'mistake';
  return revealed ? 'shown' : 'correct';
}
