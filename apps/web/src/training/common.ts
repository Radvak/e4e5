import type { RepMove } from '@prepa-cahier/core';
import { createElement } from 'react';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';

/** Pause before the opponent's reply. */
export const REPLY_MS = 300;
/** Pause on a correct answer before jumping to another line. */
export const JUMP_MS = 350;
/** After a jump to another line, its last moves are replayed quickly for context. */
export const REPLAYED_PLIES = 4;
export const REPLAY_MS = 400;
/** A position failed this many times after being learnt is a "leech". */
export const LEECH_LAPSES = 3;
/** Interval (days) from which a position counts as well known. */
export const MATURE_DAYS = 21;

export function lineText(path: RepMove[]): string {
  return path.map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m.san}`).join(' ');
}

/** Short "in 3 min" / "in 2 h" / "in 4 days". */
export function inTime(date: Date): string {
  const min = Math.max(1, Math.round((date.getTime() - Date.now()) / 60_000));
  if (min < 60) return `dans ${min} min`;
  if (min < 48 * 60) return `dans ${Math.round(min / 60)} h`;
  return `dans ${Math.round(min / 1440)} jours`;
}

/** Green arrows showing the expected moves. */
export function answerArrows(moves: RepMove[]): DrawShape[] {
  return moves.map((m) => ({ orig: m.uci.slice(0, 2) as Key, dest: m.uci.slice(2, 4) as Key, brush: 'repertoire' }));
}

/**
 * Comment of the opponent's move that led to the question, shown while thinking (it describes
 * the opponent's idea; my own move's comment is only shown after answering).
 */
export function OpponentComment({ move }: { move: RepMove | undefined }) {
  if (!move?.comment) return null;
  return createElement(
    'p',
    { className: 'opponent-comment' },
    createElement('span', { className: 'muted' }, `${move.san} : `),
    createElement('span', { className: 'comment' }, move.comment),
  );
}
