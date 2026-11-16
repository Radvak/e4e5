import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import { InstallPrompt } from './components/InstallPrompt';
import { Explorer } from './pages/Explorer';
import { Games, useGamesReport } from './pages/Games';
import { Login } from './pages/Login';
import { RepertoireEditor } from './pages/RepertoireEditor';
import { Repertoires } from './pages/Repertoires';
import { Settings } from './pages/Settings';
import { Training } from './pages/Training';
import { dayStart, useSettings } from './settings';
import { Button, Icon, Menu, plural, type IconName } from './ui';

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

/**
 * The server cannot be reached. The installed app still opens offline (service worker), so say
 * whether the phone is offline, and try again by itself when the connection comes back.
 */
function Unreachable({ retry, retrying }: { retry: () => void; retrying: boolean }) {
  useEffect(() => {
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [retry]);
  return (
    <div className="page narrow stack">
      <p className="notice error">
        {navigator.onLine ? 'Le serveur ne répond pas.' : 'Pas de connexion Internet : Mon cahier a besoin du réseau pour charger vos répertoires.'}
      </p>
      <div>
        <Button onClick={retry} disabled={retrying}>
          Réessayer
        </Button>
      </div>
    </div>
  );
}

function Badge({ n, label }: { n: number; label: string }) {
  if (n <= 0) return null;
  return (
    <span className="tab-badge" aria-label={label} title={label}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

/** Mes parties: the errors of my games (moves played instead of the prepared ones), not ignored. */
function GamesBadge() {
  const n = useGamesReport().data?.inbox.errorCount ?? 0;
  return <Badge n={n} label={`${plural(n, 'erreur', 'erreurs')} dans vos parties`} />;
}

export function App() {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const { newPerDay } = useSettings();
  // Badge of the Entraîner tab: lines to review today, plus the new lines still allowed today
  // (one daily limit for all repertoires).
  const summary = useQuery({
    queryKey: ['training-summary', newPerDay],
    queryFn: () => api.trainingSummary(dayStart(), newPerDay),
    enabled: !!me.data,
    staleTime: 30_000,
  });
  const active = (summary.data ?? []).filter((s) => s.active);
  const toTrain =
    active.reduce((n, s) => n + s.dueLines, 0) +
    Math.min(summary.data?.[0]?.remainingNewLines ?? 0, active.reduce((n, s) => n + s.availableLines, 0));
  const badge = (to: string) =>
    to === '/train' ? (
      <Badge n={toTrain} label={`${toTrain} lignes à revoir aujourd’hui`} />
    ) : to === '/parties' ? (
      <GamesBadge />
    ) : null;

  if (me.isLoading) return null;
  if (me.error instanceof ApiError && me.error.status === 401) return <Login />;
  if (!me.data) return <Unreachable retry={() => void me.refetch()} retrying={me.isFetching} />;

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

      <InstallPrompt />

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
