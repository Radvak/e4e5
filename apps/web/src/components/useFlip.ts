/**
 * The rows of a list slide to their new place when their order changes (a move paused goes down
 * into the paused zone, a move made main goes up): FLIP animation. Rows carry data-flip (a key
 * stable for the row); their position is measured relative to the list after each render, so a
 * scroll of the page does not move anything.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';

const MS = 320;

export function useFlip(list: RefObject<HTMLElement | null>) {
  const before = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const origin = el.getBoundingClientRect().top;
    const now = new Map<string, number>();
    for (const row of el.querySelectorAll<HTMLElement>('[data-flip]')) {
      const key = row.dataset.flip!;
      const top = row.getBoundingClientRect().top - origin;
      now.set(key, top);
      const was = before.current.get(key);
      // Not a row being dragged (it follows the pointer, then lands where dropped).
      if (was !== undefined && Math.abs(was - top) > 1 && !reduced && !row.classList.contains('dragging')) {
        row.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'none' }], { duration: MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      }
    }
    before.current = now;
  });
}
