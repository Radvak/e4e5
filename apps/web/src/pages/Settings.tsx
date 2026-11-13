import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Me } from '../api';

export function Settings({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [chesscom, setChesscom] = useState(me.chesscom?.username ?? '');
  const [password, setPassword] = useState('');
  const [login, setLogin] = useState(me.lichess?.username.toLowerCase() ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const onSaved = ({ user, warning }: { user: Me; warning?: string }) => {
    qc.setQueryData(['me'], user);
    setMessage(warning ?? 'Saved.');
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
  const error = saveChesscom.error ?? savePassword.error ?? unlink.error;

  return (
    <div className="settings">
      <h2>Settings</h2>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error.message}</p>}

      <section className="panel">
        <h3>Account</h3>
        <p>
          {me.username}
          {me.guest && <span className="muted"> (guest: no password, for testing only)</span>}
          {me.login && <span className="muted"> · login “{me.login}”</span>}
        </p>
        {!me.guest && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              savePassword.mutate();
            }}
          >
            {!me.login && (
              <input
                autoComplete="username"
                placeholder="Username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                aria-label="Username to log in with a password"
              />
            )}
            <input
              type="password"
              autoComplete="new-password"
              placeholder={me.hasPassword ? 'New password (8+ characters)' : 'Password (8+ characters)'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" disabled={password.length < 8 || (!me.login && login.length < 2) || savePassword.isPending}>
              {me.hasPassword ? 'Change password' : 'Add a password'}
            </button>
          </form>
        )}
        {!me.guest && !me.hasPassword && (
          <p className="muted small-text">
            Add a username and password to log in without Lichess too (e.g. on a network where Lichess is blocked).
          </p>
        )}
      </section>

      <section className="panel">
        <h3>Lichess</h3>
        {me.lichess ? (
          <>
            <p>
              Linked to <strong>{me.lichess.username}</strong>
              {me.lichess.perfs && (
                <span className="muted">
                  {' '}· blitz {me.lichess.perfs.blitz?.rating ?? '–'} · rapid {me.lichess.perfs.rapid?.rating ?? '–'}
                </span>
              )}
            </p>
            {me.hasPassword && (
              <button className="small danger" onClick={() => confirm('Unlink your Lichess account?') && unlink.mutate()}>
                Unlink
              </button>
            )}
          </>
        ) : (
          <>
            <p className="muted">
              Link your Lichess account to use your Lichess rating and statistics with your own token
              (and, later, to sync your Lichess games).
            </p>
            <a className="button" href="/api/auth/login">Connect Lichess</a>
          </>
        )}
      </section>

      <section className="panel">
        <h3>Chess.com</h3>
        <p className="muted">
          Your Chess.com username (public data only, no password needed). It is used for your
          ratings and, later, to sync your Chess.com games.
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            saveChesscom.mutate(chesscom.trim() || null);
          }}
        >
          <input placeholder="Chess.com username" value={chesscom} onChange={(e) => setChesscom(e.target.value)} />
          <button type="submit" disabled={saveChesscom.isPending}>Save</button>
        </form>
        {me.chesscom?.ratings && (
          <p className="muted">
            Chess.com ratings: rapid {me.chesscom.ratings.rapid ?? '–'} · blitz {me.chesscom.ratings.blitz ?? '–'} · bullet{' '}
            {me.chesscom.ratings.bullet ?? '–'}
          </p>
        )}
      </section>
    </div>
  );
}
