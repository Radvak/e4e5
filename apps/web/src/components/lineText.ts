/** Lines typed or pasted as text (Explorer: the moves path turned into a field). */
import { playSanOn, playUciOn, positionFromFen, START_FEN, type PlayedMove } from '@tabiya/core';

const RESULTS = new Set(['*', '1-0', '0-1', '1/2-1/2']);

/** Moves typed as SAN ("1. e4 c5 2. Nf3") or UCI ("e2e4 c7c5"), played from the start. */
export function parseMoves(text: string): PlayedMove[] | null {
  const tokens = text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !RESULTS.has(t));
  if (!tokens.length) return null;
  const pos = positionFromFen(START_FEN);
  const line: PlayedMove[] = [];
  for (const t of tokens) {
    const played = playSanOn(pos, t) ?? playUciOn(pos, t);
    if (!played) return null;
    line.push(played);
  }
  return line;
}

export const lineText = (line: PlayedMove[]) =>
  line.map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m.san}`).join(' ');
