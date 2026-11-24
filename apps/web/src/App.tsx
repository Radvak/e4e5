import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import { isLocalMode } from './local/mode';
import { clearOfflineData } from './offline/persist';
import { dropPendingReviews, pendingReviews, startReviewSync } from './offline/reviews';
import { useOnline, usePendingReviews } from './offline/useOffline';
import { InstallPrompt } from './components/InstallPrompt';
import { useTrainingSummary } from './useTrainingSummary';
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
import { t } from './i18n';
import { Button, Icon, Menu, plural, type IconName } from './ui';

/** The five sections: build, learn, the gaps (games and training), explore, and what the games show. */
const SECTIONS: { to: string; label: string; icon: IconName; active: (path: string) => boolean }[] = [
  { to: '/repertoires', label: t('Répertoires', 'Repertoires'), icon: 'book', active: (p) => p.startsWith('/repertoires') || (p.startsWith('/r/') && !p.endsWith('/train')) },
  { to: '/train', label: t('Entraîner', 'Train'), icon: 'target', active: (p) => p.endsWith('/train') },
  { to: '/gaps', label: t('Lacunes', 'Gaps'), icon: 'level', active: (p) => p.startsWith('/gaps') },
  { to: '/explorer', label: t('Explorer', 'Explore'), icon: 'compass', active: (p) => p.startsWith('/explorer') },
  { to: '/games', label: t('Mes parties', 'My games'), icon: 'games', active: (p) => p.startsWith('/games') },
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
function Unreachable({ retry, retrying, error }: { retry: () => void; retrying: boolean; error: unknown }) {
  useEffect(() => {
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [retry]);
  return (
    <div className="page narrow stack">
      <p className="notice error">
        {isLocalMode()
          ? localProblem(error)
          : navigator.onLine
            ? t('Le serveur ne répond pas.', 'The server does not answer.')
            : t(
                'Pas de connexion Internet. Ouvrez e4e5 une fois en ligne : vos répertoires sont alors gardés sur l’appareil pour vous entraîner hors ligne.',
                'No Internet connection. Open e4e5 once online: your repertoires are then kept on the device so you can train offline.',
              )}
      </p>
      <div>
        <Button onClick={retry} disabled={retrying}>
          {t('Réessayer', 'Try again')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Without a server (local mode), the database of this device could not be opened: most often
 * e4e5 is open in another tab (the browser lets one tab at a time hold it). The app asks again
 * every 30 s, so closing the other tab is enough.
 */
function localProblem(error: unknown): string {
  const why = error instanceof Error ? error.message : String(error);
  // The worker's message (local/sqlite.worker.ts) is always in French.
  return why.includes('autre onglet')
    ? t('e4e5 est déjà ouvert dans un autre onglet : fermez-le, cette page reprend d’elle-même (ou rechargez-la).', 'e4e5 is already open in another tab: close it, this page resumes by itself (or reload it).')
    : t(`Les données de cet appareil n’ont pas pu être ouvertes (${why}). Rechargez la page.`, `The data of this device could not be opened (${why}). Reload the page.`);
}

/**
 * Offline (no network, or the server does not answer): the app runs on the data kept on the
 * device. Training works and the answers are sent later; changes and live statistics wait.
 * Without a server (local mode), everything is on the device: only its database failing to open
 * is said (`error`), and being offline matters only for Lichess and Chess.com.
 */
function OfflineBanner({ serverDown, error }: { serverDown: boolean; error: unknown }) {
  const online = useOnline();
  const pending = usePendingReviews();
  if (isLocalMode()) {
    if (serverDown) return <p className="notice error offline-banner" role="status">{localProblem(error)}</p>;
    if (!online) return <p className="notice offline-banner" role="status">{t('Hors ligne : tout fonctionne sur l’appareil, sauf ce qui passe par Lichess et Chess.com (parties, études).', 'Offline: everything works on the device, except what goes through Lichess and Chess.com (games, studies).')}</p>;
    return null;
  }
  if (online && !serverDown) return null;
  return (
    <p className="notice offline-banner" role="status">
      {t(
        <>
          {online ? 'Le serveur ne répond pas' : 'Hors ligne'} : vous pouvez vous entraîner, vos réponses seront envoyées au retour de la connexion
          {pending > 0 && ` (${plural(pending, 'réponse', 'réponses')} en attente)`}. Modifier un répertoire et les statistiques Lichess demandent le réseau.
        </>,
        <>
          {online ? 'The server does not answer' : 'Offline'}: you can train, your answers will be sent when the connection is back
          {pending > 0 && ` (${plural(pending, 'answer', 'answers')} waiting)`}. Editing a repertoire and the Lichess statistics need the network.
        </>,
      )}
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

/** Lacunes: the errors of my games (moves played instead of the prepared ones), not ignored. */
function GamesBadge() {
  const n = useGamesReport().data?.inbox.errorCount ?? 0;
  return <Badge n={n} label={t(`${plural(n, 'erreur', 'erreurs')} dans vos parties`, `${plural(n, 'error', 'errors')} in your games`)} />;
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
      <Badge n={toTrain} label={t(`${toTrain} lignes à revoir aujourd’hui`, `${toTrain} lines to review today`)} />
    ) : to === '/gaps' ? (
      <GamesBadge />
    ) : null;

  if (restoring || me.isLoading) return null;
  if (unauthorized) return <Login />;
  if (!me.data) return <Unreachable retry={() => void me.refetch()} retrying={me.isFetching} error={me.error} />;

  const logout = async () => {
    const pending = pendingReviews();
    const warning = t(
      `${plural(pending, 'réponse d’entraînement n’est', 'réponses d’entraînement ne sont')} pas encore envoyée${pending > 1 ? 's' : ''} (hors ligne) : se déconnecter maintenant les perd. Continuer ?`,
      `${plural(pending, 'training answer has', 'training answers have')} not been sent yet (offline): signing out now loses ${pending === 1 ? 'it' : 'them'}. Continue?`,
    );
    if (pending && !confirm(warning)) return;
    try {
      await api.logout();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('Déconnexion impossible', 'Could not sign out'));
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
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" />
          e4e5
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
          title={t('Compte', 'Account')}
          label={
            <>
              {me.data.username}
              {me.data.guest && t(' (invité)', ' (guest)')}
            </>
          }
          items={[
            { label: t('Mon compte', 'My account'), to: '/account' },
            { label: t('Paramètres', 'Settings'), to: '/settings' },
            // Local mode: no login, the accounts are on the device.
            ...(me.data.local ? [] : [{ label: t('Se déconnecter', 'Sign out'), onClick: logout, danger: true }]),
          ]}
        />
      </header>

      <OfflineBanner serverDown={!!me.error} error={me.error} />

      <main className="page">
        <Routes>
          <Route path="/" element={<Redirect to="/repertoires" />} />
          <Route path="/games" element={<Games />} />
          <Route path="/repertoires" element={<Repertoires me={me.data} />} />
          <Route path="/repertoires/new" element={<NewRepertoire me={me.data} />} />
          <Route path="/r/:id" element={<RepertoireEditor me={me.data} />} />
          <Route path="/r/:id/train" element={<Training me={me.data} />} />
          <Route path="/train" element={<Training me={me.data} />} />
          <Route path="/explorer" element={<Explorer me={me.data} />} />
          <Route path="/gaps" element={<Lacunes />} />
          <Route path="/settings" element={<Settings me={me.data} />} />
          <Route path="/account" element={<Account me={me.data} />} />
          {me.data.local && <Route path="/lichess-callback" element={<LichessCallback />} />}
          {/* Former French addresses. */}
          <Route path="/parties" element={<Redirect to="/games" />} />
          <Route path="/lacunes" element={<Redirect to="/gaps" />} />
          <Route path="/compte" element={<Redirect to="/account" />} />
          <Route path="/repertoires/nouveau" element={<Redirect to="/repertoires/new" />} />
          <Route path="/bilan/*" element={<Redirect to="/gaps" />} />
          <Route path="/stats" element={<Redirect to="/gaps" />} />
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
