/**
 * The analysis under the board (one button turns it on): the moves of Lichess players at my level
 * (first, shown by default) and Stockfish's lines, both computed, one card in view at a time,
 * switched by a horizontal swipe (touch screens), a scroll (trackpad) or the two tabs above. The
 * first time in the session, the strip shows a glimpse of the Stockfish card: it is there, to the
 * side. The strip is as high as the card in view.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { Icon } from '../ui';

export type Tool = 'level' | 'engine';
const TOOLS: { id: Tool; label: string }[] = [
  { id: 'level', label: t('Lichess à votre niveau', 'Lichess at your level') },
  { id: 'engine', label: 'Stockfish' },
];

/**
 * On/off of the analysis (both tools), kept for the browser session only: the search at my level
 * costs many Lichess requests, so it never starts by itself on a new visit.
 */
export function useAnalysisToggle() {
  const [on, setOn] = useState(() => sessionStorage.getItem('analysis') === 'on');
  const toggle = (next: boolean) => {
    sessionStorage.setItem('analysis', next ? 'on' : 'off');
    setOn(next);
  };
  return [on, toggle] as const;
}

/** The analysis button, next to the board navigation. */
export function AnalysisToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (on: boolean) => void }) {
  return (
    <button
      className={`analysis-toggle ${enabled ? 'on' : ''}`}
      onClick={() => onToggle(!enabled)}
      title={
        enabled
          ? t('Arrêter l’analyse (a)', 'Stop the analysis (a)')
          : t('Analyser : coups des joueurs Lichess à votre niveau et Stockfish (a)', 'Analyse: moves of Lichess players at your level and Stockfish (a)')
      }
      aria-label={enabled ? t('Arrêter l’analyse', 'Stop the analysis') : t('Analyser la position', 'Analyse the position')}
      aria-pressed={enabled}
    >
      <Icon name="analysis" />
    </button>
  );
}

export function ToolCards({ engine, level }: { engine: ReactNode; level: ReactNode }) {
  const [shown, setShown] = useState<Tool>('level');
  const track = useRef<HTMLDivElement>(null);
  const nodes: Record<Tool, ReactNode> = { level, engine };

  const choose = (tool: Tool) => {
    const el = track.current;
    if (el) el.scrollTo({ left: TOOLS.findIndex((t) => t.id === tool) * el.clientWidth, behavior: 'smooth' });
  };
  /** The card the strip snapped to (swipe, scroll or tab). */
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const tool = TOOLS[Math.round(el.scrollLeft / Math.max(1, el.clientWidth))]?.id;
    if (tool && tool !== shown) setShown(tool);
  };

  // First time in the session: a glimpse of the Stockfish card, to show it is there to the side.
  useEffect(() => {
    if (sessionStorage.getItem('analysisHint')) return;
    sessionStorage.setItem('analysisHint', '1');
    const el = track.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const peek = setTimeout(() => el.scrollTo({ left: Math.min(72, el.clientWidth / 4), behavior: 'smooth' }), 500);
    const back = setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), 1100);
    return () => {
      clearTimeout(peek);
      clearTimeout(back);
    };
  }, []);

  // The strip as high as the card in view (not the tallest one), following its changes of size.
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const card = track.current?.children[TOOLS.findIndex((t) => t.id === shown)] as HTMLElement | undefined;
    if (!card) return;
    const measure = () => setHeight(card.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div className="tool-cards">
      <div className="tool-tabs" role="tablist">
        {TOOLS.map((t) => (
          <button key={t.id} role="tab" aria-selected={shown === t.id} className={shown === t.id ? 'on' : ''} onClick={() => choose(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div ref={track} className="tool-track several" style={height ? { height } : undefined} onScroll={onScroll}>
        {TOOLS.map((t) => (
          <div key={t.id} className="tool-card" role="tabpanel" aria-hidden={t.id !== shown}>
            {nodes[t.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
