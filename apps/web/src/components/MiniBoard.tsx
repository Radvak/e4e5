import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawBrushes, DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useRef } from 'react';
import { BRUSHES, type ArrowKind } from './arrows';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

export interface MiniArrow {
  uci: string;
  kind: ArrowKind;
}

/** Small view-only board: a position with a few arrows (thumbnails of "Mes parties"). */
export function MiniBoard({ fen, orientation, arrows = [], className = '' }: { fen: string; orientation: 'white' | 'black'; arrows?: MiniArrow[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const cg = useRef<Api | null>(null);
  useEffect(() => {
    cg.current = Chessground(el.current!, {
      viewOnly: true,
      coordinates: false,
      animation: { enabled: false },
      drawable: { enabled: false, brushes: BRUSHES as unknown as DrawBrushes },
    });
    return () => cg.current?.destroy();
  }, []);
  useEffect(() => {
    const shapes: DrawShape[] = arrows.map((a) => ({ orig: a.uci.slice(0, 2) as Key, dest: a.uci.slice(2, 4) as Key, brush: a.kind }));
    cg.current?.set({ fen, orientation, drawable: { autoShapes: shapes } });
  }, [fen, orientation, arrows.map((a) => a.uci + a.kind).join()]);
  return <div ref={el} className={`mini-board ${className}`} />;
}
