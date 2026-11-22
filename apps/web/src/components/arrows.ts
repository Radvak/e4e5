/**
 * Arrow colours on the board. The same colours mark the moves around the board (repertoire
 * moves, moves to complete, engine line: see --rep, --hole, --engine in styles.css), which
 * acts as the legend.
 */
export const ARROWS = {
  repertoire: { color: '#3a9a62', label: 'dans votre répertoire' },
  next: { color: '#3a9a62', label: 'coup suivant (→)' },
  nextDraft: { color: '#f0883e', label: 'coup suivant, pas encore enregistré (→)' },
  popular: { color: '#f0883e', label: 'coup manquant : joué souvent, pas encore dans votre répertoire' },
  // Dark grey: the blues are taken (?! light blue), and it stands out from every other colour.
  engine: { color: '#2b2b2b', label: 'meilleur coup du moteur' },
  level: { color: '#bc8cff', label: 'meilleur coup à votre niveau' },
  // Same green as the paused move in the list (--rep, faded there too), almost transparent.
  paused: { color: '#5cb380', label: 'en pause, pas entraîné' },
  pausedNext: { color: '#5cb380', label: 'coup suivant, en pause (→)' },
  mistake: { color: '#e5534b', label: 'coup joué à la place du coup préparé' },
} as const;

export type ArrowKind = keyof typeof ARROWS;

const OPACITY: Partial<Record<string, number>> = { next: 1, nextDraft: 1, paused: 0.25, pausedNext: 0.4 };

/** chessground brushes for the arrow kinds. */
export const BRUSHES = {
  ...Object.fromEntries(
    Object.entries(ARROWS).map(([key, a]) => [key, { key, color: a.color, opacity: OPACITY[key] ?? 0.85, lineWidth: 10 }]),
  ),
  /** White arrow drawn just under the next move, slightly wider: a thin outline. */
  outline: { key: 'outline', color: '#ffffff', opacity: 1, lineWidth: 10 },
};

/** Extra width (chessground lineWidth units) of the outline around the next move. */
export const OUTLINE_EXTRA = 1.3;
