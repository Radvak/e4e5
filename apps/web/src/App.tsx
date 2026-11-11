import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { api, ApiError } from './api';
import { Login } from './pages/Login';
import { RepertoireEditor } from './pages/RepertoireEditor';
import { RepertoireList } from './pages/RepertoireList';
import { ratingFor, useSettings, type SpeedChoice } from './settings';

export function App() {
  const qc = useQueryClient();
  const { speed, setSpeed } = useSettings();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });

  if (me.isLoading) return null;
  if (me.error instanceof ApiError && me.error.status === 401) return <Login />;
  if (!me.data) return <p className="error">Cannot reach the server.</p>;

  return (
    <div className="app">
      <header className="topbar">
        <strong>Prepa-cahier</strong>
        <div className="spacer" />
        <label title="Time control used for the Lichess statistics">
          Stats for{' '}
          <select value={speed} onChange={(e) => setSpeed(e.target.value as SpeedChoice)}>
            <option value="blitz">Blitz</option>
            <option value="rapid">Rapid</option>
            <option value="both">Blitz + Rapid</option>
          </select>
        </label>
        <span className="muted">
          {me.data.username} {me.data.lichess ? `(${ratingFor(me.data.perfs, speed)})` : '(guest)'}
        </span>
        <button
          className="small"
          onClick={async () => {
            await api.logout();
            qc.clear();
            location.href = '/';
          }}
        >
          Logout
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<RepertoireList />} />
          <Route path="/r/:id" element={<RepertoireEditor me={me.data} />} />
        </Routes>
      </main>
    </div>
  );
}
