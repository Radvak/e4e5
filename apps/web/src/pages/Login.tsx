import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';

const ERRORS: Record<string, string> = {
  failed: 'Lichess login failed, please try again.',
  'lichess-already-linked': 'This Lichess account is already linked to another Prepa-cahier account.',
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
      <h1>Prepa-cahier</h1>
      <p>Build your opening repertoire, see what players of your level actually play, and grow it from your own games.</p>
      {loginError && <p className="error">{ERRORS[loginError] ?? ERRORS.failed}</p>}

      <a className="button big" href="/api/auth/login">Login with Lichess</a>

      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          account.mutate();
        }}
      >
        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Log in
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>
        <input
          placeholder="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder={mode === 'register' ? 'Password (8+ characters)' : 'Password'}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={!username.trim() || !password || account.isPending}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        {account.error && <p className="error">{account.error.message}</p>}
        {mode === 'register' && (
          <p className="muted small-text">Play on Chess.com? Create an account, then add your Chess.com username in Settings.</p>
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
          <p className="muted">…or try it as a guest (no password, for testing):</p>
          <div className="row">
            <input placeholder="Your name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            <button type="submit" disabled={!guestName.trim() || guest.isPending}>Continue as guest</button>
          </div>
          {guest.error && <p className="error">{guest.error.message}</p>}
        </form>
      )}
    </div>
  );
}
