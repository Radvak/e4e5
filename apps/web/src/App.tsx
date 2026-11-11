import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Routes } from 'react-router-dom';
import { api, ApiError } from './api';
import { Login } from './pages/Login';
import { RepertoireEditor } from './pages/RepertoireEditor';
import { RepertoireList } from './pages/RepertoireList';
import { Settings } from './pages/Settings';
import { useSettings, type SpeedChoice } from './settings';

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
        <Link to="/" className="brand">Prepa-cahier</Link>
        <div className="spacer" />
        <label title="Time control used for the Lichess statistics">
          Stats for{' '}
          <select value={speed} onChange={(e) => setSpeed(e.target.value as SpeedChoice)}>
            <option value="blitz">Blitz</option>
            <option value="rapid">Rapid</option>
            <option value="both">Blitz + Rapid</option>
          </select>
        </label>
        <Link to="/settings" title="Settings and linked accounts">
          {me.data.username}
          {me.data.guest && ' (guest)'}
        </Link>
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
          <Route path="/settings" element={<Settings me={me.data} />} />
        </Routes>
      </main>
    </div>
  );
}
