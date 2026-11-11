import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';

export function Login() {
  const failed = new URLSearchParams(location.search).get('login') === 'failed';
  const config = useQuery({ queryKey: ['auth-config'], queryFn: api.authConfig });
  const [name, setName] = useState('');
  const guest = useMutation({
    mutationFn: () => api.guestLogin(name.trim()),
    onSuccess: () => (location.href = '/'),
  });

  return (
    <div className="login">
      <h1>Prepa-cahier</h1>
      <p>Build your opening repertoire, see what players of your level actually play, and grow it from your own games.</p>
      {failed && <p className="error">Login failed, please try again.</p>}
      <a className="button big" href="/api/auth/login">Login with Lichess</a>

      {config.data?.guestLogin && (
        <form
          className="guest"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) guest.mutate();
          }}
        >
          <p className="muted">…or continue without Lichess (no statistics):</p>
          <div className="row">
            <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" disabled={!name.trim() || guest.isPending}>Continue as guest</button>
          </div>
          {guest.error && <p className="error">{String(guest.error)}</p>}
        </form>
      )}
    </div>
  );
}
