/** Arrow colours on the board, shared with the legend so both always match. */
export const ARROWS = {
  repertoire: { color: '#3fb950', label: 'dans votre répertoire' },
  next: { color: '#3fb950', label: 'coup suivant (→)' },
  popular: { color: '#f0883e', label: 'joué souvent, pas dans votre répertoire' },
  engine: { color: '#58a6ff', label: 'meilleur coup du moteur' },
} as const;

export type ArrowKind = keyof typeof ARROWS;

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
