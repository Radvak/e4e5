import { positionFromFen } from '@e4e5/core';
import { parseSquare } from 'chessops';
import captureUrl from '../sounds/Capture.mp3';
import { SOUND_KEY } from '../settings';
import moveUrl from '../sounds/Move.mp3';

// Sounds of Lichess' "standard" set (lichess-org/lila, AGPLv3+).

const audio = typeof Audio === 'undefined' ? null : { move: new Audio(moveUrl), capture: new Audio(captureUrl) };
if (audio) for (const a of Object.values(audio)) a.preload = 'auto';

export function playMoveSound(capture: boolean) {
  const a = audio?.[capture ? 'capture' : 'move'];
  if (!a || localStorage.getItem(SOUND_KEY) === 'false') return; // turned off in Paramètres
  a.currentTime = 0;
  a.play().catch(() => {}); // blocked before the first user interaction: no sound
}

/**
 * The sound of `uci` played from `fen`, or null if it is not a move of the side to move
 * (e.g. going back in a line: the last move is not playable from the previous position).
 */
export function moveSoundFor(fen: string, uci: string): { capture: boolean } | null {
  const pos = positionFromFen(fen);
  const orig = parseSquare(uci.slice(0, 2));
  const dest = parseSquare(uci.slice(2, 4));
  if (orig === undefined || dest === undefined) return null;
  const piece = pos.board.get(orig);
  if (!piece || piece.color !== pos.turn) return null;
  const target = pos.board.get(dest);
  const enPassant = piece.role === 'pawn' && !target && orig % 8 !== dest % 8;
  return { capture: (!!target && target.color !== piece.color) || enPassant };
}
