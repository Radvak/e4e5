import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Me } from '../api';
import { GameSyncRows, useGameSync } from '../components/GameSync';
import { t, translateError } from '../i18n';
import { Button, PageHeader } from '../ui';
import { useScrollToHash } from './Settings';

/** Mon compte: login and password, accounts linked on Lichess and Chess.com, game sync. */
export function Account({ me }: { me: Me }) {
  const qc = useQueryClient();
  const sync = useGameSync();
  const [chesscom, setChesscom] = useState(me.chesscom?.username ?? '');
  const [password, setPassword] = useState('');
  const [login, setLogin] = useState(me.lichess?.username.toLowerCase() ?? '');
  const [message, setMessage] = useState<string | null>(null);
  useScrollToHash();

  const onSaved = ({ user, warning }: { user: Me; warning?: string }) => {
    qc.setQueryData(['me'], user);
    void qc.invalidateQueries({ queryKey: ['game-sync'] });
    setMessage(warning ? translateError(warning) : t('Enregistré.', 'Saved.'));
  };
  const saveChesscom = useMutation({
    mutationFn: (name: string | null) => api.updateMe({ chesscomUsername: name }),
    onSuccess: onSaved,
  });
  const savePassword = useMutation({
    mutationFn: () => api.updateMe(me.login ? { password } : { password, login }),
    onSuccess: (r) => {
      setPassword('');
      onSaved(r);
    },
  });
  const unlink = useMutation({ mutationFn: api.unlinkLichess, onSuccess: onSaved });
  const error = saveChesscom.error ?? savePassword.error ?? unlink.error ?? sync.start.error;

  return (
    <div className="narrow-page stack">
      <PageHeader
        title={t('Mon compte', 'My account')}
        subtitle={t(<>Réglages de l’application : <Link to="/settings">Paramètres</Link></>, <>App settings: <Link to="/settings">Settings</Link></>)}
      />
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error.message}</p>}

      <section className="card" id="compte">
        <h3>{t('Compte', 'Account')}</h3>
        <p>
          <strong>{me.username}</strong>
          {me.guest && <span className="muted">{t(' · invité (sans mot de passe, pour tester)', ' · guest (no password, for testing)')}</span>}
          {me.login && !me.guest && <span className="muted">{t(` · identifiant « ${me.login} »`, ` · login “${me.login}”`)}</span>}
          {me.local && <span className="muted">{t(' · sur cet appareil (mode local, sans connexion)', ' · on this device (local mode, not signed in)')}</span>}
        </p>
        {!me.guest && !me.local && (
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              savePassword.mutate();
            }}
          >
            {!me.login && (
              <input autoComplete="username" placeholder={t('Identifiant', 'Login')} value={login} onChange={(e) => setLogin(e.target.value)} aria-label={t('Identifiant', 'Login')} />
            )}
            <input
              type="password"
              autoComplete="new-password"
              placeholder={me.hasPassword ? t('Nouveau mot de passe', 'New password') : t('Mot de passe (8 caractères min.)', 'Password (8 characters min.)')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" disabled={password.length < 8 || (!me.login && login.length < 2) || savePassword.isPending}>
              {me.hasPassword ? t('Changer le mot de passe', 'Change password') : t('Ajouter un mot de passe', 'Add a password')}
            </Button>
          </form>
        )}
        {!me.guest && !me.local && !me.hasPassword && (
          <p className="muted small-text">
            {t(
              'Un identifiant et un mot de passe permettent aussi de se connecter sans Lichess (par exemple sur un réseau où Lichess est bloqué).',
              'A login and a password also let you sign in without Lichess (for example on a network where Lichess is blocked).',
            )}
          </p>
        )}
      </section>

      <section className="card" id="comptes">
        <h3>{t('Comptes liés', 'Linked accounts')}</h3>
        <div className="setting">
          <div className="what">
            <strong>Lichess</strong>
            <div className="hint">
              {me.lichess
                ? <>{t('Lié à', 'Linked to')} <strong>{me.lichess.username}</strong>{me.lichess.perfs && <> · blitz {me.lichess.perfs.blitz?.rating ?? '–'} · {t('rapide', 'rapid')} {me.lichess.perfs.rapid?.rating ?? '–'}</>}</>
                : t('Votre classement Lichess, des statistiques à jour et vos parties Lichess.', 'Your Lichess rating, up-to-date statistics and your Lichess games.')}
            </div>
          </div>
          {me.lichess ? (
            (me.hasPassword || me.local) && (
              <Button size="sm" variant="danger" onClick={() => confirm(t('Délier votre compte Lichess ?', 'Unlink your Lichess account?')) && unlink.mutate()}>
                {t('Délier', 'Unlink')}
              </Button>
            )
          ) : (
            <Button
              size="sm"
              href={me.local ? undefined : '/api/auth/login'}
              onClick={me.local ? () => void import('../local/lichessLogin').then((m) => m.startLichessLogin()) : undefined}
            >
              {t('Lier Lichess', 'Link Lichess')}
            </Button>
          )}
        </div>
        <div className="setting">
          <div className="what">
            <strong>Chess.com</strong>
            <div className="hint">
              {t('Votre pseudo (données publiques, aucun mot de passe).', 'Your username (public data, no password).')}
              {me.chesscom?.ratings && <> {t('Classements : rapide', 'Ratings: rapid')} {me.chesscom.ratings.rapid ?? '–'} · blitz {me.chesscom.ratings.blitz ?? '–'} · bullet {me.chesscom.ratings.bullet ?? '–'}</>}
            </div>
          </div>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              saveChesscom.mutate(chesscom.trim() || null);
            }}
          >
            <input placeholder={t('Pseudo Chess.com', 'Chess.com username')} value={chesscom} onChange={(e) => setChesscom(e.target.value)} />
            <Button size="sm" type="submit" disabled={saveChesscom.isPending}>{t('Enregistrer', 'Save')}</Button>
          </form>
        </div>
        {sync.state && (
          <>
            <h4 className="section-title">{t('Synchronisation', 'Sync')}</h4>
            <GameSyncRows state={sync.state} onSync={(s) => sync.start.mutate(s)} />
          </>
        )}
      </section>
    </div>
  );
}
