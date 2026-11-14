/**
 * Arrow colours on the board. The same colours mark the moves around the board (repertoire
 * moves, moves to complete, engine line: see --rep, --hole, --engine in styles.css), which
 * acts as the legend.
 */
export const ARROWS = {
  repertoire: { color: '#3fb950', label: 'dans votre répertoire' },
  next: { color: '#3fb950', label: 'coup suivant (→)' },
  popular: { color: '#f0883e', label: 'joué souvent, pas dans votre répertoire' },
  engine: { color: '#58a6ff', label: 'meilleur coup du moteur' },
  mistake: { color: '#e5534b', label: 'coup joué à la place du coup préparé' },
} as const;

export type ArrowKind = keyof typeof ARROWS;

/** A popular move (orange arrow) among the most played ones: top 6 and 3% of the games or more. */
export const isPopular = (rank: number, share: number) => rank < 6 && share >= 0.03;

/** chessground brushes for the arrow kinds. */
export const BRUSHES = {
  ...Object.fromEntries(
    Object.entries(ARROWS).map(([key, a]) => [key, { key, color: a.color, opacity: key === 'next' ? 1 : 0.85, lineWidth: 10 }]),
  ),
  /** White arrow drawn just under the next move, slightly wider: a thin outline. */
  outline: { key: 'outline', color: '#ffffff', opacity: 1, lineWidth: 10 },
};

/** Extra width (chessground lineWidth units) of the outline around the next move. */
export const OUTLINE_EXTRA = 1.3;
