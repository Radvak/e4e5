import { useNavigate, useParams } from 'react-router-dom';
import type { Me } from '../api';
import { PageHeader, Tabs } from '../ui';
import { Games } from './Games';
import { Stats } from './Stats';

type Tab = 'parties' | 'progres';

/** All repertoires at once: what the games show, the training progress. */
export function Bilan(_: { me: Me }) {
  const { tab = 'parties' } = useParams();
  const navigate = useNavigate();
  const current = (['parties', 'progres'] as const).includes(tab as Tab) ? (tab as Tab) : 'parties';
  return (
    <div className="bilan">
      <PageHeader title="Bilan" subtitle="Tous vos répertoires" back="/" />
      <div style={{ marginBottom: 16 }}>
        <Tabs
          block
          value={current}
          onChange={(t) => navigate(`/bilan/${t}`, { replace: true })}
          tabs={[
            { id: 'parties', label: 'Parties' },
            { id: 'progres', label: 'Progrès' },
          ]}
        />
      </div>
      {current === 'parties' && <Games />}
      {current === 'progres' && <Stats />}
    </div>
  );
}
