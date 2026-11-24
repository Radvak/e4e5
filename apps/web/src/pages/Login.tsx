import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { lang, setLang, t, type Lang } from '../i18n';
import { Button, Tabs } from '../ui';

const ERRORS: Record<string, string> = t(
  {
    failed: 'La connexion avec Lichess a échoué, réessayez.',
    'lichess-already-linked': 'Ce compte Lichess est déjà lié à un autre compte e4e5.',
  },
  {
    failed: 'Signing in with Lichess failed, try again.',
    'lichess-already-linked': 'This Lichess account is already linked to another e4e5 account.',
  },
);

export function Login() {
  const loginError = new URLSearchParams(location.search).get('login');
  const config = useQuery({ queryKey: ['auth-config'], queryFn: api.authConfig });
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState('');
  const done = () => (location.href = '/');

  const account = useMutation({
    mutationFn: () =>
      mode === 'login' ? api.passwordLogin(username.trim(), password) : api.register(username.trim(), password),
    onSuccess: done,
  });
  const guest = useMutation({ mutationFn: () => api.guestLogin(guestName.trim()), onSuccess: done });

  return (
    <div className="login">
      <img className="brand-mark" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" />
      <h1>e4e5</h1>
      <p>
        {t(
          'Construisez votre répertoire d’ouvertures, voyez ce que jouent les joueurs de votre niveau, et faites-le grandir avec vos propres parties.',
          'Build your opening repertoire, see what players of your level play, and grow it with your own games.',
        )}
      </p>
      {loginError && <p className="notice error">{ERRORS[loginError] ?? ERRORS.failed}</p>}

      <Button variant="primary" size="lg" block href="/api/auth/login">{t('Se connecter avec Lichess', 'Sign in with Lichess')}</Button>

      <div className="or">{t('ou avec un identifiant', 'or with a login')}</div>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          account.mutate();
        }}
      >
        <Tabs
          block
          value={mode}
          onChange={setMode}
          tabs={[
            { id: 'login', label: t('Se connecter', 'Sign in') },
            { id: 'register', label: t('Créer un compte', 'Create an account') },
          ]}
        />
        <input placeholder={t('Identifiant', 'Login')} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input
          type="password"
          placeholder={mode === 'register' ? t('Mot de passe (8 caractères min.)', 'Password (8 characters min.)') : t('Mot de passe', 'Password')}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" block disabled={!username.trim() || !password || account.isPending}>
          {mode === 'login' ? t('Se connecter', 'Sign in') : t('Créer le compte', 'Create the account')}
        </Button>
        {account.error && <p className="error">{account.error.message}</p>}
        {mode === 'register' && (
          <p className="muted small-text">
            {t(
              'Vous jouez sur Chess.com ? Créez un compte, puis indiquez votre pseudo Chess.com dans les paramètres.',
              'Playing on Chess.com? Create an account, then enter your Chess.com username in the settings.',
            )}
          </p>
        )}
      </form>

      {config.data?.guestLogin && (
        <form
          className="guest"
          onSubmit={(e) => {
            e.preventDefault();
            if (guestName.trim()) guest.mutate();
          }}
        >
          <p className="muted small-text">{t('… ou essayer en invité (sans mot de passe, pour tester) :', '… or try as a guest (no password, for testing):')}</p>
          <div className="form-row">
            <input placeholder={t('Votre nom', 'Your name')} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            <Button type="submit" disabled={!guestName.trim() || guest.isPending}>{t('Continuer', 'Continue')}</Button>
          </div>
          {guest.error && <p className="error">{guest.error.message}</p>}
        </form>
      )}

      <div className="row" style={{ justifyContent: 'center', marginTop: 16 }} role="group" aria-label="Langue / Language">
        {(['fr', 'en'] as Lang[]).map((l) =>
          l === lang ? (
            <span key={l} className="muted small-text">{l === 'fr' ? 'Français' : 'English'}</span>
          ) : (
            <button key={l} type="button" className="link small-text" lang={l} onClick={() => setLang(l)}>
              {l === 'fr' ? 'Français' : 'English'}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
