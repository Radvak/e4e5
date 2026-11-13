import type { Color } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type GamesReport, type InboxItem, type RepertoireSummary, type Results, type SyncState } from '../api';

const PERIODS = [
  { days: 30, label: 'last 30 days' },
  { days: 90, label: 'last 3 months' },
  { days: 365, label: 'last year' },
  { days: 0, label: 'all games' },
];
const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];
const SOURCES = { chesscom: 'Chess.com', lichess: 'Lichess' } as const;

const pct = (x: number) => `${Math.round(100 * x)}%`;
const score = (r: Results) => {
  const n = r.win + r.draw + r.loss;
  return n ? (r.win + r.draw / 2) / n : 0;
};
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** "1. e4 c5 2. Nf3" */
function lineText(sans: string[]): string {
  return sans.map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${san}`).join(' ');
}
/** The move after `line`, numbered: "3. Bb5", "2... d6" (or just "d6" right after White's move). */
function moveText(line: string[], san: string, alone = false): string {
  const ply = line.length;
  if (ply % 2 === 0) return `${ply / 2 + 1}. ${san}`;
  return alone || ply === 0 ? `${(ply + 1) / 2}... ${san}` : san;
}

export function Games() {
  const qc = useQueryClient();
  const [days, setDays] = useState(() => Number(localStorage.getItem('gamesDays') ?? 90));
  const [speeds, setSpeeds] = useState<string[]>(() => JSON.parse(localStorage.getItem('gamesSpeeds') ?? '["blitz","rapid","classical","daily"]'));
  const [tab, setTab] = useState<'novelties' | 'deviations' | 'ends'>('novelties');

  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const sync = useQuery({
    queryKey: ['game-sync'],
    queryFn: api.syncState,
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status === 'running') ? 1500 : false),
  });
  const running = sync.data?.jobs.some((j) => j.status === 'running') ?? false;
  const report = useQuery({
    queryKey: ['games-report', days, speeds, running],
    queryFn: () => api.gamesReport(days, speeds),
    enabled: !running,
  });
  const start = useMutation({
    mutationFn: api.startSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['game-sync'] }),
  });
  const restore = useMutation({ mutationFn: api.restoreInbox, onSuccess: () => qc.invalidateQueries({ queryKey: ['games-report'] }) });

  const setPeriod = (d: number) => {
    localStorage.setItem('gamesDays', String(d));
    setDays(d);
  };
  const toggleSpeed = (s: string) => {
    const next = speeds.includes(s) ? speeds.filter((x) => x !== s) : [...speeds, s];
    localStorage.setItem('gamesSpeeds', JSON.stringify(next));
    setSpeeds(next);
  };
  const byId = new Map((reps.data ?? []).map((r) => [r.id, r]));
  const r = report.data;

  return (
    <div className="games-page">
      <header className="row">
        <h2>Games</h2>
      </header>

      <SyncPanel state={sync.data} onSync={(s) => start.mutate(s)} error={start.error} />

      <div className="row filters">
        <select value={days} onChange={(e) => setPeriod(Number(e.target.value))} aria-label="Period">
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>{p.label}</option>
          ))}
        </select>
        {SPEEDS.map((s) => (
          <label key={s} className="check">
            <input type="checkbox" checked={speeds.includes(s)} onChange={() => toggleSpeed(s)} /> {s}
          </label>
        ))}
        {r && <span className="muted">{r.games} games</span>}
      </div>

      {report.isLoading && <p className="muted">Analysing your games…</p>}
      {report.error && <p className="error">{String(report.error)}</p>}
      {r && r.games === 0 && <p className="muted">No game for these filters{sync.data && !Object.keys(sync.data.counts).length ? ': sync your games first.' : '.'}</p>}

      {r && r.games > 0 && (
        <>
          <RepertoireStats report={r} reps={byId} />

          <section className="panel">
            <div className="row">
              <h3>Inbox</h3>
              <div className="tabs inline">
                <button className={tab === 'novelties' ? 'active' : ''} onClick={() => setTab('novelties')} title="The opponent played a move you have not prepared">
                  Opponent novelties ({r.inbox.novelties.length})
                </button>
                <button className={tab === 'deviations' ? 'active' : ''} onClick={() => setTab('deviations')} title="You played something else than your prepared move">
                  Your deviations ({r.inbox.deviations.length})
                </button>
                <button className={tab === 'ends' ? 'active' : ''} onClick={() => setTab('ends')} title="The game went on after the end of your line">
                  Ends of your lines ({r.inbox.ends.length})
                </button>
              </div>
              <button className="small" onClick={() => restore.mutate()} title="Show the dismissed items again">show dismissed</button>
            </div>
            <p className="muted small-text">
              Grouped by position, most frequent first. Adding a line removes the item: the next games will follow it.
            </p>
            {r.inbox[tab].length === 0 && <p className="muted">Nothing here.</p>}
            <ul className="inbox">
              {r.inbox[tab].map((item) => (
                <InboxRow key={item.key} item={item} rep={byId.get(item.repertoireId)} />
              ))}
            </ul>
          </section>

          <RecentGames report={r} reps={byId} />
        </>
      )}
    </div>
  );
}

function SyncPanel({ state, onSync, error }: { state: SyncState | undefined; onSync: (s: 'chesscom' | 'lichess') => void; error: Error | null }) {
  if (!state) return null;
  return (
    <section className="panel">
      <h3>Sync</h3>
      <table className="lines">
        <tbody>
          {(['chesscom', 'lichess'] as const).map((source) => {
            const account = state.accounts[source];
            const job = state.jobs.find((j) => j.source === source);
            const last = state.syncs.find((s) => s.source === source);
            return (
              <tr key={source}>
                <td><strong>{SOURCES[source]}</strong></td>
                <td>{account ?? <Link to="/settings">{source === 'chesscom' ? 'set your username' : 'link your account'} in Settings</Link>}</td>
                <td className="muted">
                  {(state.counts[source] ?? 0).toLocaleString()} games
                  {last && ` · synced ${date(last.syncedAt)}`}
                </td>
                <td className="muted small-text">
                  {job?.status === 'running' &&
                    `syncing… ${job.progress ? `month ${job.progress.done}/${job.progress.total}, ` : ''}${job.added} new games`}
                  {job?.status === 'done' &&
                    `${job.added} new game${job.added === 1 ? '' : 's'}${job.reviews ? `, ${job.reviews} position${job.reviews > 1 ? 's' : ''} to review (recent deviations)` : ''}`}
                  {job?.status === 'error' && <span className="error">{job.error}</span>}
                </td>
                <td>
                  <button disabled={!account || job?.status === 'running'} onClick={() => onSync(source)}>
                    {last ? 'Sync new games' : 'Import my games'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <p className="error">{error.message}</p>}
    </section>
  );
}

function ResultBar({ results }: { results: Results }) {
  const n = results.win + results.draw + results.loss || 1;
  return (
    <span className="result-bar" title={`${results.win} won · ${results.draw} drawn · ${results.loss} lost`}>
      <span className="win" style={{ width: pct(results.win / n) }} />
      <span className="draw" style={{ width: pct(results.draw / n) }} />
      <span className="loss" style={{ width: pct(results.loss / n) }} />
    </span>
  );
}

function RepertoireStats({ report, reps }: { report: GamesReport; reps: Map<string, RepertoireSummary> }) {
  const rows = report.repertoires.filter((x) => x.games > 0).sort((a, b) => b.games - a.games);
  const colors: Color[] = ['white', 'black'];
  return (
    <section className="panel">
      <h3>By repertoire</h3>
      <table className="lines">
        <thead>
          <tr>
            <th />
            <th>Games</th>
            <th>Score</th>
            <th />
            <th title="Average number of moves played in your preparation">In book</th>
          </tr>
        </thead>
        {colors.map((color) => {
          const own = rows.filter((x) => reps.get(x.id)?.color === color);
          const out = report.outside.filter((o) => o.color === color);
          if (!own.length && !out.length) return null;
          return (
            <tbody key={color}>
              {own.map((x) => (
                <tr key={x.id}>
                  <td>
                    <span className={`dot inline ${color}`} /> <Link to={`/r/${x.id}`}>{reps.get(x.id)?.name}</Link>
                  </td>
                  <td>{x.games}</td>
                  <td>{pct(score(x.results))}</td>
                  <td><ResultBar results={x.results} /></td>
                  <td>{x.bookMoves.toFixed(1)} moves</td>
                </tr>
              ))}
              {out.slice(0, 4).map((o) => (
                <tr key={o.move} className="muted">
                  <td title="You played another first move than in your repertoires">
                    <span className={`dot inline ${color}`} /> outside your repertoires: {o.move}
                  </td>
                  <td>{o.games}</td>
                  <td>{pct(score(o.results))}</td>
                  <td><ResultBar results={o.results} /></td>
                  <td />
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </section>
  );
}

function InboxRow({ item, rep }: { item: InboxItem; rep: RepertoireSummary | undefined }) {
  const qc = useQueryClient();
  const [done, setDone] = useState<string | null>(null);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['games-report'] });
    await qc.invalidateQueries({ queryKey: ['repertoire', item.repertoireId] });
  };
  const add = useMutation({
    mutationFn: (ucis: string[]) => api.saveLine(item.repertoireId, ucis),
    onSuccess: async (res) => {
      setDone(`${res.added} move${res.added === 1 ? '' : 's'} added to ${rep?.name ?? 'the repertoire'}.`);
      await refresh();
    },
  });
  const review = useMutation({
    mutationFn: () => api.reviewNow(item.repertoireId, item.fen),
    onSuccess: () => setDone('Due for review now.'),
  });
  const dismiss = useMutation({ mutationFn: () => api.dismissInbox(item.key), onSuccess: refresh });

  const line = item.line.sans;
  const afterMove = [...item.line.ucis, item.move.uci];
  const after = [...line, item.move.san];
  const explorer = `/explorer?${new URLSearchParams({ line: afterMove.join(','), ...(rep?.color === 'black' ? { color: 'black' } : {}) })}`;
  const editor = `/r/${item.repertoireId}?${new URLSearchParams({ line: afterMove.join(',') })}`;
  const error = add.error ?? review.error ?? dismiss.error;

  return (
    <li className="inbox-item">
      <div className="inbox-head">
        <span className="muted">{lineText(line) || 'Initial position'} </span>
        <span className="hole-move">{moveText(line, item.move.san)}</span>
        <span className="rep-tag"><span className={`dot inline ${rep?.color ?? 'white'}`} /> {rep?.name ?? '?'}</span>
        <span className="muted small-text">
          {item.games} game{item.games > 1 ? 's' : ''} · {pct(score(item.results))} score · last {date(item.lastPlayedAt)} ·{' '}
          <a href={item.example} target="_blank" rel="noreferrer">a game ↗</a>
        </span>
      </div>
      <div className="inbox-body">
        {item.kind === 'deviation' && (
          <span>
            You played <strong>{moveText(line, item.move.san, true)}</strong> instead of{' '}
            <strong>{item.expected.map((s) => moveText(line, s, true)).join(' or ')}</strong>.{' '}
          </span>
        )}
        {item.kind === 'end' && <span>Your line ends here. </span>}
        {item.replies.length > 0 && (
          <span className="muted">
            You answered {item.replies.slice(0, 3).map((x) => `${moveText(after, x.san, true)} (${x.games}, ${pct(score(x.results))})`).join(', ')}.{' '}
          </span>
        )}
      </div>
      <div className="row inbox-actions">
        {item.kind === 'deviation' && (
          <>
            <button className="small" disabled={review.isPending} onClick={() => review.mutate()} title="Make this position due in training now">
              Review now
            </button>
            <button className="small" disabled={add.isPending} onClick={() => add.mutate(afterMove)} title="Accept your move as another answer">
              Add {moveText(line, item.move.san, true)} to the repertoire
            </button>
          </>
        )}
        {item.kind !== 'deviation' &&
          item.replies.slice(0, 2).map((x) => (
            <button key={x.uci} className="small" disabled={add.isPending} onClick={() => add.mutate([...afterMove, x.uci])}>
              Add {moveText(line, item.move.san, true)} {moveText(after, x.san)}
            </button>
          ))}
        {item.kind === 'end' && item.replies.length === 0 && (
          <button className="small" disabled={add.isPending} onClick={() => add.mutate(afterMove)}>
            Add {moveText(line, item.move.san, true)}
          </button>
        )}
        <Link className="button small" to={explorer} title="Statistics, games and engine for this position">Explorer</Link>
        <Link className="button small" to={editor} title="Choose another move in the editor">Editor</Link>
        <button className="small" disabled={dismiss.isPending} onClick={() => dismiss.mutate()} title="Hide this item">Dismiss</button>
        {done && <span className="success-text small-text">{done}</span>}
        {error && <span className="error small-text">{error.message}</span>}
      </div>
    </li>
  );
}

const KIND_TEXT = {
  'in-book': 'stayed in your preparation',
  'my-deviation': 'you deviated',
  'opponent-novelty': 'opponent novelty',
  'end-of-prep': 'after the end of your line',
  outside: 'outside your repertoires',
} as const;

function RecentGames({ report, reps }: { report: GamesReport; reps: Map<string, RepertoireSummary> }) {
  return (
    <details className="panel">
      <summary>Recent games</summary>
      <table className="lines">
        <tbody>
          {report.recent.map((g) => {
            const sans = g.move ? [g.move.san] : [];
            const at = g.move ? `${moveText(new Array(g.ply).fill(''), g.move.san, true)}: ` : '';
            return (
              <tr key={g.id}>
                <td className="muted">{date(g.playedAt)}</td>
                <td>
                  <span className={`dot inline ${g.color}`} /> {g.opponent} <span className="muted">{g.opponentRating}</span>
                </td>
                <td className={`result ${g.result}`}>{g.result}</td>
                <td className="muted">{g.speed}</td>
                <td>{g.repertoireId ? reps.get(g.repertoireId)?.name : '—'}</td>
                <td className="small-text">
                  {sans.length ? at : ''}
                  {KIND_TEXT[g.kind]}
                  {g.kind !== 'outside' && g.kind !== 'in-book' && <span className="muted"> (move {Math.floor(g.ply / 2) + 1})</span>}
                </td>
                <td>
                  <Link className="small-text" to={`/explorer?${new URLSearchParams({ line: g.ucis.join(','), ...(g.color === 'black' ? { color: 'black' } : {}) })}`}>
                    explorer
                  </Link>{' '}
                  <a className="small-text" href={g.url} target="_blank" rel="noreferrer">game ↗</a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
