import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { Button, Tabs } from '../ui';

const ERRORS: Record<string, string> = {
  failed: 'La connexion avec Lichess a échoué, réessayez.',
  'lichess-already-linked': 'Ce compte Lichess est déjà lié à un autre compte Tabiya.',
};

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
      <img className="brand-mark" src="/icons/icon.svg" alt="" />
      <h1>Tabiya</h1>
      <p>Construisez votre répertoire d’ouvertures, voyez ce que jouent les joueurs de votre niveau, et faites-le grandir avec vos propres parties.</p>
      {loginError && <p className="notice error">{ERRORS[loginError] ?? ERRORS.failed}</p>}

      <Button variant="primary" size="lg" block href="/api/auth/login">Se connecter avec Lichess</Button>

      <div className="or">ou avec un identifiant</div>
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
            { id: 'login', label: 'Se connecter' },
            { id: 'register', label: 'Créer un compte' },
          ]}
        />
        <input placeholder="Identifiant" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input
          type="password"
          placeholder={mode === 'register' ? 'Mot de passe (8 caractères min.)' : 'Mot de passe'}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" block disabled={!username.trim() || !password || account.isPending}>
          {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </Button>
        {account.error && <p className="error">{account.error.message}</p>}
        {mode === 'register' && (
          <p className="muted small-text">Vous jouez sur Chess.com ? Créez un compte, puis indiquez votre pseudo Chess.com dans les paramètres.</p>
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
          <p className="muted small-text">… ou essayer en invité (sans mot de passe, pour tester) :</p>
          <div className="form-row">
            <input placeholder="Votre nom" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            <Button type="submit" disabled={!guestName.trim() || guest.isPending}>Continuer</Button>
          </div>
          {guest.error && <p className="error">{guest.error.message}</p>}
        </form>
      )}
    </div>
  );
}
