/** Arrow colours on the board, shared with the legend so both always match. */
export const ARROWS = {
  repertoire: { color: '#3fb950', label: 'in your repertoire' },
  /** Same green as the repertoire, drawn dashed (see styles.css). */
  next: { color: '#3fb950', label: 'next move (→)' },
  popular: { color: '#f0883e', label: 'popular, not in your repertoire' },
  engine: { color: '#58a6ff', label: "engine's best move" },
} as const;

export type ArrowKind = keyof typeof ARROWS;

/** chessground brushes for the arrow kinds. */
export const BRUSHES = Object.fromEntries(
  Object.entries(ARROWS).map(([key, a]) => [key, { key, color: a.color, opacity: 0.85, lineWidth: 10 }]),
);
