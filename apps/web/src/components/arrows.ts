/** Arrow colours on the board, shared with the legend so both always match. */
export const ARROWS = {
  repertoire: { color: '#3fb950', label: 'in your repertoire' },
  popular: { color: '#f0883e', label: 'popular, not in your repertoire' },
} as const;

export type ArrowKind = keyof typeof ARROWS;

/** chessground brushes for the arrow kinds. */
export const BRUSHES = Object.fromEntries(
  Object.entries(ARROWS).map(([key, a]) => [key, { key, color: a.color, opacity: 0.85, lineWidth: 10 }]),
);
