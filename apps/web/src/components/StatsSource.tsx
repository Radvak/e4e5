import { Link } from 'react-router-dom';
import type { Me } from '../api';
import { t } from '../i18n';
import { explorerParams, rangeLabel, speedsLabel, useSettings } from '../settings';

/** Reminder of where the statistics come from, linking to the settings to change it. */
export function StatsSource({ me }: { me: Me }) {
  const { speed, range } = useSettings();
  const ex = explorerParams(me, speed, range);
  return (
    <Link className="chip source-chip" to="/settings#statistiques" title={t('Changer dans les paramètres', 'Change in the settings')}>
      Lichess {rangeLabel(ex.ratings)} · {speedsLabel(ex.speeds)}
      {ex.auto && <span className="muted">(auto)</span>}
    </Link>
  );
}
