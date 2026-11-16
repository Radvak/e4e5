import { positionFromFen } from '@prepa-cahier/core';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawBrushes, DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { parseSquare } from 'chessops';
import { chessgroundDests } from 'chessops/compat';
import { useEffect, useRef } from 'react';
import { BRUSHES } from './arrows';
import { moveSoundFor, playMoveSound } from './sound';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

interface Props {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: string;
  shapes?: DrawShape[];
  /** Called with the UCI of a move played on the board (promotion: queen). */
  onMove?: (uci: string) => void;
  /** Change it to put the pieces back on `fen` (e.g. after a rejected move). */
  resetKey?: number;
}

const NO_SHAPES: DrawShape[] = [];

export function Board({ fen, orientation, lastMove, shapes = NO_SHAPES, onMove, resetKey = 0 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const cg = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const prevFen = useRef<string | null>(null);
  /** Move just played on the board: its sound is already played, not again when `fen` follows. */
  const dropped = useRef<string | null>(null);

  useEffect(() => {
    cg.current = Chessground(el.current!, {
      animation: { duration: 150 },
      coordinates: true,
      // chessground deep-merges config: these brushes are added to its default ones.
      drawable: { brushes: BRUSHES as unknown as DrawBrushes },
    });
    return () => cg.current?.destroy();
  }, []);

  useEffect(() => {
    // A sound when the position follows from the previous one by `lastMove` (a move played
    // here, the opponent's reply, a step forward in a line); none when loading or going back.
    if (prevFen.current && prevFen.current !== fen && lastMove) {
      const sound = dropped.current === lastMove.slice(0, 4) ? null : moveSoundFor(prevFen.current, lastMove);
      if (sound) playMoveSound(sound.capture);
    }
    dropped.current = null;
    prevFen.current = fen;
    const pos = positionFromFen(fen);
    cg.current?.set({
      fen,
      orientation,
      turnColor: pos.turn,
      check: pos.isCheck(),
      lastMove: lastMove ? [lastMove.slice(0, 2) as Key, lastMove.slice(2, 4) as Key] : undefined,
      movable: {
        free: false,
        color: onMove ? pos.turn : undefined,
        dests: chessgroundDests(pos) as Map<Key, Key[]>,
        showDests: true,
        events: {
          after: (orig, dest) => {
            const piece = pos.board.get(parseSquare(orig)!);
            const promo = piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1') ? 'q' : '';
            const sound = moveSoundFor(fen, orig + dest);
            if (sound) playMoveSound(sound.capture);
            dropped.current = orig + dest;
            onMoveRef.current?.(orig + dest + promo);
          },
        },
      },
      drawable: { autoShapes: shapes },
    });
  }, [fen, orientation, lastMove, shapes, !!onMove, resetKey]);

  return <div ref={el} className="board" />;
}
