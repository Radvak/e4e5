import { RATING_BUCKETS } from '@e4e5/core';
import { t } from '../i18n';
import { rangeLabel, useSettings } from '../settings';

/**
 * Picks which Lichess players the statistics come from. The explorer only knows fixed rating
 * buckets, so the two sliders move bucket by bucket.
 */
export function RatingRange({ current }: { current: number[] }) {
  const { range, setRange } = useSettings();
  const lo = RATING_BUCKETS.indexOf(Math.min(...current) as (typeof RATING_BUCKETS)[number]);
  const hi = RATING_BUCKETS.indexOf(Math.max(...current) as (typeof RATING_BUCKETS)[number]);
  const set = (a: number, b: number) => setRange([RATING_BUCKETS[Math.min(a, b)]!, RATING_BUCKETS[Math.max(a, b)]!]);
  const max = RATING_BUCKETS.length - 1;

  return (
    <div className="rating-range">
      <div className="row">
        <strong className="big">{rangeLabel(current)}</strong>
        {range ? (
          <button className="small" onClick={() => setRange(null)} title={t('Revenir à la tranche autour de votre classement', 'Back to the range around your rating')}>
            {t('Automatique', 'Automatic')}
          </button>
        ) : (
          <span className="badge accent">{t('automatique', 'automatic')}</span>
        )}
      </div>
      <div className="row nowrap sliders">
        <input type="range" min={0} max={max} value={lo} aria-label={t('Classement minimum', 'Minimum rating')} onChange={(e) => set(Number(e.target.value), hi)} />
        <input type="range" min={0} max={max} value={hi} aria-label={t('Classement maximum', 'Maximum rating')} onChange={(e) => set(lo, Number(e.target.value))} />
      </div>
    </div>
  );
}
