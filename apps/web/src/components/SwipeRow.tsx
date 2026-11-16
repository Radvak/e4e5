import { useRef, useState, type ReactNode } from 'react';

interface Side {
  label: string;
  /** May return a promise: if it fails, the row comes back. */
  action: () => unknown;
}

/**
 * Swipe actions on touch screens, like a mail app: the row follows the finger sideways and, past
 * a threshold, slides out and runs the action of that side. Vertical moves still scroll the page;
 * a mouse or a pen does nothing (the buttons are there).
 */
export function SwipeRow({ right, left, children }: { right?: Side; left?: Side; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  /** null until the move is clearly sideways or vertical. */
  const axis = useRef<'x' | 'y' | null>(null);
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const side = (d: number) => (d > 0 ? right : d < 0 ? left : undefined);
  const reset = () => {
    start.current = null;
    axis.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={el}
      className="swipe-row"
      onPointerDown={(e) => {
        // Not from an open dialog of the row (React events bubble through it).
        if (e.pointerType !== 'touch' || (e.target as Element).closest('dialog')) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        axis.current = null;
        swiped.current = false;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const x = e.clientX - s.x;
        const y = e.clientY - s.y;
        if (!axis.current) {
          if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
          axis.current = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
          if (axis.current === 'x') {
            el.current?.setPointerCapture(e.pointerId);
            setDragging(true);
            swiped.current = true;
          }
        }
        // A side without an action only gives a little.
        if (axis.current === 'x') setDx(side(x) ? x : x / 5);
      }}
      onPointerUp={(e) => {
        if (!start.current || start.current.id !== e.pointerId) return;
        const width = el.current?.offsetWidth ?? 300;
        const s = side(dx);
        reset();
        if (s && Math.abs(dx) > Math.min(120, width * 0.35)) {
          setDx(Math.sign(dx) * width);
          // After the slide out; if the action fails, the row comes back.
          setTimeout(() => {
            Promise.resolve()
              .then(s.action)
              .catch(() => setDx(0));
          }, 180);
        } else setDx(0);
      }}
      onPointerCancel={() => {
        reset();
        setDx(0);
      }}
      // A swipe is not a click on the row.
      onClickCapture={(e) => {
        if (swiped.current) {
          e.stopPropagation();
          e.preventDefault();
          swiped.current = false;
        }
      }}
    >
      <div className={`swipe-bg ${dx > 0 ? 'right' : 'left'}`} aria-hidden style={{ opacity: Math.min(1, Math.abs(dx) / 80) }}>
        {side(dx)?.label}
      </div>
      <div className="swipe-content" style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? 'none' : 'transform 0.18s ease-out' }}>
        {children}
      </div>
    </div>
  );
}
