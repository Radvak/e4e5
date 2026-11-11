import { positionFromFen } from '@prepa-cahier/core';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawBrushes, DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { parseSquare } from 'chessops';
import { chessgroundDests } from 'chessops/compat';
import { useEffect, useRef } from 'react';
import { BRUSHES } from './arrows';
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
            onMoveRef.current?.(orig + dest + promo);
          },
        },
      },
      drawable: { autoShapes: shapes },
    });
  }, [fen, orientation, lastMove, shapes, !!onMove, resetKey]);

  return <div ref={el} className="board" />;
}
