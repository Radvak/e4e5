import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import { Explorer } from './pages/Explorer';
import { Games } from './pages/Games';
import { Login } from './pages/Login';
import { RepertoireEditor } from './pages/RepertoireEditor';
import { Repertoires } from './pages/Repertoires';
import { Settings } from './pages/Settings';
import { Training } from './pages/Training';
import { dayStart, useSettings } from './settings';
import { Icon, Menu, type IconName } from './ui';

/** The four sections: build, learn, explore, and what the games show. */
const SECTIONS: { to: string; label: string; icon: IconName; active: (path: string) => boolean }[] = [
  { to: '/repertoires', label: 'Répertoires', icon: 'book', active: (p) => p.startsWith('/repertoires') || (p.startsWith('/r/') && !p.endsWith('/train')) },
  { to: '/train', label: 'Entraîner', icon: 'target', active: (p) => p.endsWith('/train') },
  { to: '/explorer', label: 'Explorer', icon: 'compass', active: (p) => p.startsWith('/explorer') },
  { to: '/parties', label: 'Mes parties', icon: 'games', active: (p) => p.startsWith('/parties') },
];

/** Old addresses, kept working. */
function Redirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={to + search} replace />;
}

export function App() {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const { newPerDay } = useSettings();
  // Badge of the Entraîner tab: lines to go through today (due and new positions grouped by line).
  const summary = useQuery({
    queryKey: ['training-summary', newPerDay],
    queryFn: () => api.trainingSummary(dayStart(), newPerDay),
    enabled: !!me.data,
    staleTime: 30_000,
  });
  const toTrain = (summary.data ?? []).filter((s) => s.active).reduce((n, s) => n + s.lines, 0);
  const badge = (to: string) =>
    to === '/train' && toTrain > 0 ? <span className="tab-badge" aria-label={`${toTrain} lignes à revoir`} title={`${toTrain} lignes à revoir aujourd’hui`}>{toTrain > 99 ? '99+' : toTrain}</span> : null;

  if (me.isLoading) return null;
  if (me.error instanceof ApiError && me.error.status === 401) return <Login />;
  if (!me.data) return <p className="error">Le serveur ne répond pas.</p>;

  const logout = async () => {
    await api.logout();
    qc.clear();
    location.href = '/';
  };

  return (
    <div className="shell">
      <header className="appbar">
        <Link to="/repertoires" className="brand">
          <span className="brand-mark">♞</span>
          Mon cahier
        </Link>
        <nav className="appnav">
          {SECTIONS.map((s) => (
            <Link key={s.to} to={s.to} className={s.active(pathname) ? 'active' : ''}>
              {s.label}
              {badge(s.to)}
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        <Menu
          trigger={me.data.username.slice(0, 1).toUpperCase()}
          title="Compte"
          label={
            <>
              {me.data.username}
              {me.data.guest && ' (invité)'}
            </>
          }
          items={[
            { label: 'Paramètres', to: '/settings' },
            { label: 'Se déconnecter', onClick: logout, danger: true },
          ]}
        />
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<Redirect to="/repertoires" />} />
          <Route path="/parties" element={<Games />} />
          <Route path="/repertoires" element={<Repertoires me={me.data} />} />
          <Route path="/r/:id" element={<RepertoireEditor me={me.data} />} />
          <Route path="/r/:id/train" element={<Training me={me.data} />} />
          <Route path="/train" element={<Training me={me.data} />} />
          <Route path="/explorer" element={<Explorer me={me.data} />} />
          <Route path="/bilan" element={<Redirect to="/parties" />} />
          <Route path="/bilan/parties" element={<Redirect to="/parties" />} />
          <Route path="/bilan/progres" element={<Redirect to="/train" />} />
          <Route path="/settings" element={<Settings me={me.data} />} />
          <Route path="/stats" element={<Redirect to="/train" />} />
          <Route path="/gaps" element={<Redirect to="/repertoires" />} />
          <Route path="/games" element={<Redirect to="/parties" />} />
          <Route path="*" element={<Redirect to="/" />} />
        </Routes>
      </main>

      <nav className="tabbar">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className={s.active(pathname) ? 'active' : ''}>
            <Icon name={s.icon} size={22} />
            {s.label}
            {badge(s.to)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
