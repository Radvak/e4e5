/**
 * Drag and drop of the repertoire moves of a position (editor), with the mouse or a finger,
 * from a grip handle. Two zones: the moves trained (the first one is the main move) and the
 * paused ones. Rows carry data-zone and data-id; the paused zone starts at its header
 * (data-paused-zone).
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type MoveZone = 'active' | 'paused';
/** Where the dragged move would land: its zone and its rank among the other moves of the zone. */
export interface DropTarget {
  zone: MoveZone;
  index: number;
}

export function useMoveDrag(onDrop: (id: number, target: DropTarget) => void) {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<({ id: number; startY: number; dy: number } & DropTarget) | null>(null);

  const targetAt = (y: number, id: number): DropTarget => {
    const ul = listRef.current;
    if (!ul) return { zone: 'active', index: 0 };
    const header = ul.querySelector<HTMLElement>('[data-paused-zone]');
    const zone: MoveZone = header && y > header.getBoundingClientRect().top ? 'paused' : 'active';
    const rows = [...ul.querySelectorAll<HTMLElement>(`[data-zone="${zone}"]`)].filter((r) => r.dataset.id !== String(id));
    const index = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return y < b.top + b.height / 2;
    });
    return { zone, index: index < 0 ? rows.length : index };
  };

  /** Props of the grip handle of the move `id`. */
  const handle = (id: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ id, startY: e.clientY, dy: 0, ...targetAt(e.clientY, id) });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (drag?.id !== id) return;
      setDrag({ ...drag, dy: e.clientY - drag.startY, ...targetAt(e.clientY, id) });
    },
    onPointerUp: () => {
      if (drag?.id !== id) return;
      setDrag(null);
      onDrop(id, { zone: drag.zone, index: drag.index });
    },
    onPointerCancel: () => setDrag(null),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });

  return { listRef, drag, handle };
}
