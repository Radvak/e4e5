import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import { Bilan } from './pages/Bilan';
import { Explorer } from './pages/Explorer';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { RepertoireEditor } from './pages/RepertoireEditor';
import { Repertoires } from './pages/Repertoires';
import { Settings } from './pages/Settings';
import { Training } from './pages/Training';
import { Icon, Menu, type IconName } from './ui';

/** The four sections, in the order of the cycle: see what to do, build, learn, explore. */
const SECTIONS: { to: string; label: string; icon: IconName; active: (path: string) => boolean }[] = [
  { to: '/', label: 'Accueil', icon: 'home', active: (p) => p === '/' || p.startsWith('/bilan') },
  { to: '/repertoires', label: 'Répertoires', icon: 'book', active: (p) => p.startsWith('/repertoires') || (p.startsWith('/r/') && !p.endsWith('/train')) },
  { to: '/train', label: 'Entraîner', icon: 'target', active: (p) => p.endsWith('/train') },
  { to: '/explorer', label: 'Explorer', icon: 'compass', active: (p) => p.startsWith('/explorer') },
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
        <Link to="/" className="brand">
          <span className="brand-mark">♞</span>
          Mon cahier
        </Link>
        <nav className="appnav">
          {SECTIONS.map((s) => (
            <Link key={s.to} to={s.to} className={s.active(pathname) ? 'active' : ''}>
              {s.label}
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
          <Route path="/" element={<Home me={me.data} />} />
          <Route path="/repertoires" element={<Repertoires me={me.data} />} />
          <Route path="/r/:id" element={<RepertoireEditor me={me.data} />} />
          <Route path="/r/:id/train" element={<Training me={me.data} />} />
          <Route path="/train" element={<Training me={me.data} />} />
          <Route path="/explorer" element={<Explorer me={me.data} />} />
          <Route path="/bilan" element={<Redirect to="/bilan/parties" />} />
          <Route path="/bilan/:tab" element={<Bilan me={me.data} />} />
          <Route path="/settings" element={<Settings me={me.data} />} />
          <Route path="/stats" element={<Redirect to="/bilan/progres" />} />
          <Route path="/gaps" element={<Redirect to="/repertoires" />} />
          <Route path="/games" element={<Redirect to="/bilan/parties" />} />
          <Route path="*" element={<Redirect to="/" />} />
        </Routes>
      </main>

      <nav className="tabbar">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className={s.active(pathname) ? 'active' : ''}>
            <Icon name={s.icon} size={22} />
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
