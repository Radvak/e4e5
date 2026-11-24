import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../settings';
import { t } from '../i18n';

/**
 * The answer clock of "Se tester" (Paramètres › Temps pour répondre): runs while `running`, for
 * the question `clockKey` (a new key starts it again), and calls `onTimeout` when time is up.
 * Paused: the clock stops and the board is to be hidden (kept from one question to the next).
 */
export function useAnswerClock(running: boolean, clockKey: string, onTimeout: () => void) {
  const { answerSeconds } = useSettings();
  const [paused, setPaused] = useState(false);
  const timing = running && answerSeconds > 0;
  /** Time left on the clock of this question (what remains after a pause). */
  const left = useRef({ key: '', ms: 0 });
  if (left.current.key !== clockKey) left.current = { key: clockKey, ms: answerSeconds * 1000 };
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;

  useEffect(() => {
    if (!timing || paused) return;
    const clock = left.current;
    const start = Date.now();
    const t = setTimeout(() => timeout.current(), clock.ms);
    return () => {
      clearTimeout(t);
      clock.ms = Math.max(0, clock.ms - (Date.now() - start));
    };
  }, [timing, paused, clockKey]);

  return { timing, paused, setPaused, seconds: answerSeconds, clockKey };
}

/** The clock bar under the board, with the pause button (hides the board). */
export function AnswerTimer({ clock }: { clock: ReturnType<typeof useAnswerClock> }) {
  const { timing, paused, setPaused, seconds, clockKey } = clock;
  return (
    <div className="timer-row">
      <div className="answer-timer">
        {timing && <div key={clockKey} style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? 'paused' : 'running' }} />}
      </div>
      <button
        className="pause-btn"
        onClick={() => setPaused(!paused)}
        title={paused ? t('Reprendre', 'Resume') : t('Pause (cache l’échiquier)', 'Pause (hides the board)')}
        aria-label={paused ? t('Reprendre', 'Resume') : t('Pause', 'Pause')}
      >
        {paused ? '▶' : '❚❚'}
      </button>
    </div>
  );
}
