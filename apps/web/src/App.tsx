import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import { clearOfflineData } from './offline/persist';
import { dropPendingReviews, pendingReviews, startReviewSync } from './offline/reviews';
import { useOnline, usePendingReviews } from './offline/useOffline';
import { InstallPrompt } from './components/InstallPrompt';
import { useTrainingSummary } from './useTrainingSummary';
import { useGaps } from './useGaps';
import type { Me } from './api';
import { Lacunes } from './pages/Lacunes';
import { Explorer } from './pages/Explorer';
import { Games, useGamesReport } from './pages/Games';
import { LichessCallback } from './pages/LichessCallback';
import { Login } from './pages/Login';
import { RepertoireEditor } from './pages/RepertoireEditor';
import { Repertoires } from './pages/Repertoires';
import { NewRepertoire } from './pages/NewRepertoire';
import { Account } from './pages/Account';
import { Settings } from './pages/Settings';
import { Training } from './pages/Training';
import { Button, Icon, Menu, plural, type IconName } from './ui';

/** The five sections: build, learn, the gaps (games and training), explore, and what the games show. */
const SECTIONS: { to: string; label: string; icon: IconName; active: (path: string) => boolean }[] = [
  { to: '/repertoires', label: 'Répertoires', icon: 'book', active: (p) => p.startsWith('/repertoires') || (p.startsWith('/r/') && !p.endsWith('/train')) },
  { to: '/train', label: 'Entraîner', icon: 'target', active: (p) => p.endsWith('/train') },
  { to: '/lacunes', label: 'Lacunes', icon: 'level', active: (p) => p.startsWith('/lacunes') },
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
        {navigator.onLine
          ? 'Le serveur ne répond pas.'
          : 'Pas de connexion Internet. Ouvrez Tabiya une fois en ligne : vos répertoires sont alors gardés sur l’appareil pour vous entraîner hors ligne.'}
      </p>
      <div>
        <Button onClick={retry} disabled={retrying}>
          Réessayer
        </Button>
      </div>
    </div>
  );
}

/**
 * Offline (no network, or the server does not answer): the app runs on the data kept on the
 * device. Training works and the answers are sent later; changes and live statistics wait.
 */
function OfflineBanner({ serverDown }: { serverDown: boolean }) {
  const online = useOnline();
  const pending = usePendingReviews();
  if (online && !serverDown) return null;
  return (
    <p className="notice offline-banner" role="status">
      {online ? 'Le serveur ne répond pas' : 'Hors ligne'} : vous pouvez vous entraîner, vos réponses seront envoyées au retour de la connexion
      {pending > 0 && ` (${plural(pending, 'réponse', 'réponses')} en attente)`}. Modifier un répertoire et les statistiques Lichess demandent le réseau.
    </p>
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

/**
 * Lichess statistics being fetched in the background (gap finder, depth of the lines): how many
 * positions are left. Shown on every page, which also keeps the fetching going (the gap report
 * is asked again while some are pending, each pass reaching deeper positions).
 */
function StatsProgress({ me }: { me: Me }) {
  const gaps = useGaps(me);
  const pending = (gaps.data?.white?.pending ?? 0) + (gaps.data?.black?.pending ?? 0);
  if (!pending) return null;
  return (
    <span className="stats-progress" title={`Statistiques Lichess en cours de récupération : ${plural(pending, 'position', 'positions')}`} aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {pending}
    </span>
  );
}

/** Lacunes: the errors of my games (moves played instead of the prepared ones), not ignored. */
function GamesBadge() {
  const n = useGamesReport().data?.inbox.errorCount ?? 0;
  return <Badge n={n} label={`${plural(n, 'erreur', 'erreurs')} dans vos parties`} />;
}

export function App() {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const restoring = useIsRestoring();
  // Kept on the device: offline (or server down) the app opens on it, and asks again now and then.
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false, refetchInterval: (q) => (q.state.error ? 30_000 : false) });
  const userId = me.data?.id;
  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  // Training answers given offline are sent from here, for the signed-in user.
  useEffect(() => (userId ? startReviewSync(qc, userId) : undefined), [qc, userId]);
  // Signed out (session expired): forget the previous account's data kept on the device.
  useEffect(() => {
    if (unauthorized) qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  }, [qc, unauthorized]);
  // Badge of the Entraîner tab: lines to review today, plus the new lines still allowed today
  // (one daily limit for all repertoires).
  const summary = useTrainingSummary(me.data);
  const active = (summary.data ?? []).filter((s) => s.active);
  const toTrain =
    active.reduce((n, s) => n + s.dueLines, 0) +
    Math.min(summary.data?.[0]?.remainingNewLines ?? 0, active.reduce((n, s) => n + s.availableLines, 0));
  const badge = (to: string) =>
    to === '/train' ? (
      <Badge n={toTrain} label={`${toTrain} lignes à revoir aujourd’hui`} />
    ) : to === '/lacunes' ? (
      <GamesBadge />
    ) : null;

  if (restoring || me.isLoading) return null;
  if (unauthorized) return <Login />;
  if (!me.data) return <Unreachable retry={() => void me.refetch()} retrying={me.isFetching} />;

  const logout = async () => {
    const pending = pendingReviews();
    if (pending && !confirm(`${plural(pending, 'réponse d’entraînement n’est', 'réponses d’entraînement ne sont')} pas encore envoyée${pending > 1 ? 's' : ''} (hors ligne) : se déconnecter maintenant les perd. Continuer ?`)) return;
    try {
      await api.logout();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Déconnexion impossible');
      return;
    }
    await dropPendingReviews();
    await clearOfflineData(qc);
    location.href = '/';
  };

  return (
    <div className="shell">
      <header className="appbar">
        <Link to="/repertoires" className="brand">
          <img className="brand-mark" src="/icons/icon.svg" alt="" />
          Tabiya
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
        <StatsProgress me={me.data} />
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
            { label: 'Mon compte', to: '/compte' },
            { label: 'Paramètres', to: '/settings' },
            // Local mode: no login, the accounts are on the device.
            ...(me.data.local ? [] : [{ label: 'Se déconnecter', onClick: logout, danger: true }]),
          ]}
        />
      </header>

      <OfflineBanner serverDown={!!me.error} />

      <main className="page">
        <Routes>
          <Route path="/" element={<Redirect to="/repertoires" />} />
          <Route path="/parties" element={<Games />} />
          <Route path="/repertoires" element={<Repertoires me={me.data} />} />
          <Route path="/repertoires/nouveau" element={<NewRepertoire me={me.data} />} />
          <Route path="/r/:id" element={<RepertoireEditor me={me.data} />} />
          <Route path="/r/:id/train" element={<Training me={me.data} />} />
          <Route path="/train" element={<Training me={me.data} />} />
          <Route path="/explorer" element={<Explorer me={me.data} />} />
          <Route path="/lacunes" element={<Lacunes />} />
          <Route path="/bilan" element={<Redirect to="/lacunes" />} />
          <Route path="/bilan/parties" element={<Redirect to="/lacunes" />} />
          <Route path="/bilan/progres" element={<Redirect to="/lacunes" />} />
          <Route path="/settings" element={<Settings me={me.data} />} />
          <Route path="/compte" element={<Account me={me.data} />} />
          {me.data.local && <Route path="/lichess-callback" element={<LichessCallback />} />}
          <Route path="/stats" element={<Redirect to="/lacunes" />} />
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
