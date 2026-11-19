/**
 * Move annotations (NAGs of the PGN: !, ?, !!, ??, !?, ?!): the move is coloured and followed by
 * its symbol, with the usual colours (as on Lichess). Other NAGs (positions, ±…) are not shown.
 */
export const MOVE_NAGS: Record<number, { symbol: string; kind: string; label: string }> = {
  1: { symbol: '!', kind: 'good', label: 'Bon coup' },
  2: { symbol: '?', kind: 'mistake', label: 'Erreur' },
  3: { symbol: '!!', kind: 'brilliant', label: 'Coup brillant' },
  4: { symbol: '??', kind: 'blunder', label: 'Gaffe' },
  5: { symbol: '!?', kind: 'interesting', label: 'Coup intéressant' },
  6: { symbol: '?!', kind: 'dubious', label: 'Coup douteux' },
};

/** The move annotation among the NAGs of a move (the first one, if several). */
export function moveNag(nags: readonly number[] | null | undefined) {
  const n = nags?.find((x) => x in MOVE_NAGS);
  return n === undefined ? undefined : MOVE_NAGS[n];
}

/** A move in SAN, coloured with its annotation and followed by its symbol. */
export function San({ san, nags }: { san: string; nags?: readonly number[] | null }) {
  const nag = moveNag(nags);
  if (!nag) return <>{san}</>;
  return (
    <span className={`nag nag-${nag.kind}`} title={nag.label}>
      {san}
      {nag.symbol}
    </span>
  );
}
