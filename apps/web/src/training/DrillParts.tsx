/**
 * What sits under the board in both training modes ("Réviser" and "Se tester"), so that they
 * look and work the same: the line of the quiz, the swipe bar, the end-of-line badge and the
 * Indice / Solution and Explorer buttons.
 */
import type { Color, RepMove } from '@tabiya/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useLayoutEffect, useRef } from 'react';
import { San } from '../components/Nag';

/** Dots of the trail shown left of the swipe bar, the latest ones (older ones: "+N"). */
const MAX_DOTS = 10;

/** How a line of the session ended: right, wrong (a move missed or shown), new (learnt), passed. */
export type TrailResult = 'right' | 'wrong' | 'new' | 'passed';
export interface TrailDot {
  id: number;
  result: TrailResult;
}
const TRAIL_LABELS: Record<TrailResult, string> = { right: 'réussie', wrong: 'ratée', new: 'apprise', passed: 'passée' };

/**
 * The quiz's line (`moves`, the first one at ply `firstPly`), annotations in colour, on one line:
 * kept scrolled to its end, its beginning fading out when too long.
 */
export function QuizLine({ moves, firstPly }: { moves: RepMove[]; firstPly: number }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    e.scrollLeft = e.scrollWidth;
    e.classList.toggle('cut', e.scrollWidth > e.clientWidth);
  });
  return (
    <div ref={el} className="quiz-line" aria-label="Ligne du quiz">
      <span>
        {moves.map((m, k) => {
          const ply = firstPly + k;
          const num = ply % 2 === 0 ? `${ply / 2 + 1}. ` : k === 0 ? `${(ply + 1) / 2}… ` : '';
          return (
            <span key={ply} className="quiz-move">
              {num && <span className="muted">{num}</span>}
              <San san={m.san} nags={m.nags} />
            </span>
          );
        })}
      </span>
    </div>
  );
}

/**
 * The bar under the board to swipe on (like Android's gesture bar, touch screens only): its handle
 * follows the finger; to the left past a threshold: `onSkip`; to the right: `onBack` when there
 * is something to come back to (`passed` lines). On its left, the trail: a dot per line of the
 * session (green right, red a move missed, grey passed, hollow learnt), the latest ones; a tap on
 * one takes the line up again (`onOpen`). With a trail, the bar shows on every screen.
 */
export function SwipeBar({
  onSkip,
  onBack,
  passed = 0,
  label = 'passer',
  trail = [],
  activeId,
  onOpen,
}: {
  onSkip: () => void;
  onBack?: () => void;
  passed?: number;
  label?: string;
  trail?: TrailDot[];
  /** The dot of the question on the board (replayed from the trail). */
  activeId?: number;
  onOpen?: (id: number) => void;
}) {
  const handle = useRef<HTMLSpanElement>(null);
  const swipe = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const canBack = !!onBack && passed > 0;
  const slide = (dx: number) => {
    const el = handle.current;
    if (!el) return;
    el.style.transition = dx ? 'none' : 'transform 0.15s';
    el.style.transform = dx ? `translateX(${dx}px)` : '';
  };
  const end = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    slide(0);
    const t = e.changedTouches[0];
    if (!s || !t || s.axis !== 'x' || e.type === 'touchcancel') return;
    const dx = t.clientX - s.x;
    const threshold = Math.max(50, e.currentTarget.getBoundingClientRect().width * 0.25);
    if (-dx > threshold) onSkip();
    else if (dx > threshold && canBack) onBack!();
  };
  return (
    <div
      className={`swipe-bar${trail.length ? ' has-trail' : ''}`}
      onTouchStart={(e) => {
        const t = e.touches[0];
        swipe.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, axis: null } : null;
      }}
      onTouchMove={(e) => {
        const s = swipe.current;
        const t = e.touches[0];
        if (!s || !t) return;
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (!s.axis) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        // To the left: pass; to the right: back (if any, else it gives a little).
        if (s.axis === 'x') slide(dx < 0 || canBack ? dx : dx / 6);
      }}
      onTouchEnd={end}
      onTouchCancel={end}
      title={canBack ? `Balayez vers la gauche pour ${label}, vers la droite pour revenir (${passed} passée${passed > 1 ? 's' : ''})` : `Balayez vers la gauche pour ${label}`}
    >
      {trail.length > 0 && (
        <span className="swipe-trail" aria-label="Lignes de la séance">
          {trail.length > MAX_DOTS && <span className="more">+{trail.length - MAX_DOTS}</span>}
          {trail.slice(-MAX_DOTS).map((d) => (
            <button
              key={d.id}
              type="button"
              className={`trail-dot ${d.result}${d.id === activeId ? ' active' : ''}`}
              title={`Ligne ${TRAIL_LABELS[d.result]} — la reprendre depuis le début${d.result === 'passed' ? '' : ' (pas compté)'}`}
              aria-label={`Reprendre la ligne ${TRAIL_LABELS[d.result]}`}
              onClick={() => onOpen?.(d.id)}
            >
              <span />
            </button>
          ))}
        </span>
      )}
      <span ref={handle} className="swipe-handle" aria-hidden="true" />
      <span className="swipe-label muted">{canBack ? `← ${label} · revenir →` : `← balayez pour ${label}`}</span>
    </div>
  );
}

/** End of a line, before the next one: the board glows, a frosted pill with a check. */
export function LineDone({ text }: { text: string }) {
  return (
    <div className="line-done" role="status">
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="23" />
        <path d="M15 27l7 7 15-16" />
      </svg>
      <span>{text}</span>
    </div>
  );
}

/** One button: first the piece to move (Indice), then the solution; and the Explorer. */
export function DrillActions({
  hinted,
  disabled,
  solutionTitle,
  onHint,
  onExplorer,
}: {
  /** The piece is shown (or the answer): the button gives the solution. */
  hinted: boolean;
  disabled: boolean;
  solutionTitle: string;
  onHint: () => void;
  onExplorer: () => void;
}) {
  return (
    <div className="drill-actions">
      <button onClick={onHint} disabled={disabled} title={hinted ? solutionTitle : 'Montrer la pièce à jouer'}>
        {hinted ? '🏳 Solution' : '💡 Indice'}
      </button>
      <button onClick={onExplorer} title="Ouvrir cette position dans l’Explorer">
        🧭 Explorer
      </button>
    </div>
  );
}

/**
 * My moves in a position in all my repertoires of `color` (not only the one trained): a move of
 * another repertoire played in training is right too (an alternative), not a mistake. Fetched
 * with the question (same data as the Explorer's "in your repertoires").
 */
export function useMyMovesHere(fen: string | undefined, color: Color) {
  const q = useQuery({ queryKey: ['explorer-reps', fen], queryFn: () => api.repertoireMovesAt(fen!), enabled: !!fen, staleTime: 60_000 });
  return (uci: string) => q.data?.find((r) => r.uci === uci && r.color === color && !r.paused);
}
