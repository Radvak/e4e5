/**
 * Long press (touch) or right click (mouse) on an element: `onLong` is called (with a short
 * vibration on touch). The click that ends a long press is swallowed, so the element does not
 * also act as clicked. A finger that moves (scroll) cancels the press.
 */
import { useRef, type MouseEvent, type TouchEvent } from 'react';

const PRESS_MS = 550;

export function useLongPress() {
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  /** Props of the element for the action `onLong`. */
  return (onLong: () => void) => ({
    onTouchStart: (e: TouchEvent) => {
      fired.current = false;
      const t = e.touches[0];
      cancel();
      if (!t || e.touches.length > 1) return;
      press.current = {
        x: t.clientX,
        y: t.clientY,
        timer: window.setTimeout(() => {
          press.current = null;
          fired.current = true;
          navigator.vibrate?.(15);
          onLong();
        }, PRESS_MS),
      };
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && press.current && Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > 10) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onClickCapture: (e: MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      // On touch screens the long press already asked (Android also fires contextmenu).
      if (fired.current || press.current) return;
      onLong();
    },
  });
}
