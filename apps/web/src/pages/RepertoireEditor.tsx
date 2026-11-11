import { Repertoire, START_FEN, totalGames, turnOf } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type ImportResult, type Me, type StoredMove } from '../api';
import { Board } from '../components/Board';
import { ExplorerPanel } from '../components/ExplorerPanel';
import { explorerParams, useSettings } from '../settings';

export function RepertoireEditor({ me }: { me: Me }) {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { speed, range } = useSettings();
  const { data, isLoading, error } = useQuery({ queryKey: ['repertoire', id], queryFn: () => api.repertoire(id) });
  const [path, setPath] = useState<StoredMove[]>([]);

  const rep = useMemo(() => new Repertoire(data?.color ?? 'white', data?.moves ?? []), [data]);
  const fen = path.at(-1)?.toFen ?? START_FEN;
  const here = rep.movesAt(fen) as StoredMove[];

  // Keep the path valid after deletions.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.moves.map((m) => m.id));
    const firstMissing = path.findIndex((m) => !ids.has(m.id));
    if (firstMissing >= 0) setPath(path.slice(0, firstMissing));
  }, [data, path]);

  const ex = explorerParams(me.perfs, speed, range);
  const explorer = useQuery({
    queryKey: ['explorer', fen, ex.speeds, ex.ratings],
    queryFn: () => api.explorer(fen, ex.speeds, ex.ratings),
    staleTime: Infinity,
    retry: false,
    enabled: me.lichess,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['repertoire', id] });
  const addMove = useMutation({
    mutationFn: (uci: string) => api.addMove(id, fen, uci),
    onSuccess: async (move) => {
      await refresh();
      setPath((p) => [...p, move]);
    },
  });
  const deleteMove = useMutation({ mutationFn: (m: StoredMove) => api.deleteMove(id, m.id), onSuccess: refresh });
  const setMain = useMutation({ mutationFn: (m: StoredMove) => api.updateMove(id, m.id, { isMain: true }), onSuccess: refresh });
  const setComment = useMutation({
    mutationFn: ({ m, comment }: { m: StoredMove; comment: string }) => api.updateMove(id, m.id, { comment: comment || null }),
    onSuccess: refresh,
  });

  const play = useCallback(
    (uci: string) => {
      const existing = here.find((m) => m.uci === uci);
      if (existing) setPath((p) => [...p, existing]);
      else addMove.mutate(uci);
    },
    [here, addMove],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input')) return;
      if (e.key === 'ArrowLeft') setPath((p) => p.slice(0, -1));
      if (e.key === 'ArrowRight' && here[0]) setPath((p) => [...p, here[0]!]);
      if (e.key === 'Home') setPath([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [here]);

  const shapes = useMemo<DrawShape[]>(() => {
    const out: DrawShape[] = [];
    const ed = explorer.data;
    const total = ed ? totalGames(ed) : 0;
    const drawn = new Set<string>();
    for (const m of ed?.moves.slice(0, 6) ?? []) {
      const share = total ? totalGames(m) / total : 0;
      if (share < 0.03) continue;
      drawn.add(m.uci);
      out.push({
        orig: m.uci.slice(0, 2) as Key,
        dest: m.uci.slice(2, 4) as Key,
        brush: rep.has(fen, m.uci) ? 'green' : 'yellow',
        modifiers: { lineWidth: Math.round(4 + 12 * share) },
      });
    }
    for (const m of here) {
      if (!drawn.has(m.uci)) out.push({ orig: m.uci.slice(0, 2) as Key, dest: m.uci.slice(2, 4) as Key, brush: 'blue' });
    }
    return out;
  }, [explorer.data, rep, fen, here]);

  if (isLoading) return <p>Loading…</p>;
  if (error || !data) return <p className="error">Could not load the repertoire.</p>;

  const myTurn = turnOf(fen) === data.color;
  const last = path.at(-1);
  const conflicts = rep.conflicts();

  return (
    <div className="editor">
      <div className="editor-board">
        <Board fen={fen} orientation={data.color} lastMove={last?.uci} shapes={shapes} onMove={play} />
        <div className="nav">
          <button onClick={() => setPath([])} title="Start (Home)">⏮</button>
          <button onClick={() => setPath((p) => p.slice(0, -1))} title="Back (←)">◀</button>
          <button onClick={() => here[0] && setPath((p) => [...p, here[0]!])} title="Main line (→)">▶</button>
        </div>
        <p className="legend muted">
          Arrows: <span className="c-green">in repertoire</span> · <span className="c-yellow">popular, not prepared</span> ·{' '}
          <span className="c-blue">prepared, rarely played</span>
        </p>
      </div>

      <div className="editor-side">
        <header className="row">
          <Link to="/">← Repertoires</Link>
          <h2>{data.name}</h2>
          <span className="muted">({data.color}, {rep.size} moves)</span>
          <a className="button" href={`/api/repertoires/${id}/pgn`}>Export PGN</a>
        </header>
        {conflicts.length > 0 && (
          <p className="warning">⚠ {conflicts.length} position(s) where you have several moves prepared.</p>
        )}

        <section className="panel">
          <div className="moves-path">
            <button className="link" onClick={() => setPath([])}>Start</button>
            {path.map((m, i) => (
              <button key={i} className="link" onClick={() => setPath(path.slice(0, i + 1))}>
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{m.san}
              </button>
            ))}
          </div>
          {last && <CommentBox key={last.id} move={last} onSave={(comment) => setComment.mutate({ m: last, comment })} />}
        </section>

        <section className="panel">
          <h3>{myTurn ? 'Your move' : 'Opponent replies'} in your repertoire</h3>
          {here.length === 0 && <p className="muted">Nothing prepared yet: play a move on the board or pick one below.</p>}
          {myTurn && here.length > 1 && <p className="warning">Several moves prepared for your side here.</p>}
          <ul className="rep-moves">
            {here.map((m) => (
              <li key={m.id}>
                <button className="link" onClick={() => setPath([...path, m])}>{m.san}</button>
                {m.isMain ? <span className="muted"> main</span> : (
                  <button className="small" onClick={() => setMain.mutate(m)}>make main</button>
                )}
                {m.comment && <span className="comment"> {m.comment}</span>}
                <button
                  className="small danger"
                  onClick={() => confirm(`Delete ${m.san} and the lines after it?`) && deleteMove.mutate(m)}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
          {addMove.error && <p className="error">{String(addMove.error)}</p>}
        </section>

        {!me.lichess && (
          <section className="panel">
            <h3>Lichess statistics</h3>
            <p className="muted">Guest mode: log in with Lichess to see what players of your level play here.</p>
          </section>
        )}
        {me.lichess && <ExplorerPanel
          fen={fen}
          rep={rep}
          data={explorer.data}
          error={explorer.error}
          loading={explorer.isLoading}
          ratings={ex.ratings}
          note={
            ex.auto
              ? `Default: around your Lichess ${ex.speeds.join('+')} rating (${ex.rating}).`
              : `Custom range, ${ex.speeds.join('+')} games.`
          }
          onPick={play}
        />}

        <PgnImport repertoireId={id} onDone={refresh} />
      </div>
    </div>
  );
}

function CommentBox({ move, onSave }: { move: StoredMove; onSave: (comment: string) => void }) {
  const [text, setText] = useState(move.comment ?? '');
  return (
    <div className="comment-box">
      <textarea
        placeholder={`Comment on ${move.san}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (move.comment ?? '') && onSave(text)}
        rows={2}
      />
    </div>
  );
}

function PgnImport({ repertoireId, onDone }: { repertoireId: string; onDone: () => void }) {
  const [pgn, setPgn] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.importPgn(repertoireId, pgn),
    onSuccess: (r) => {
      setResult(r);
      setPgn('');
      onDone();
    },
  });
  return (
    <details className="panel">
      <summary>Import PGN</summary>
      <input
        type="file"
        accept=".pgn,text/plain"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) setPgn(await file.text());
        }}
      />
      <textarea rows={6} placeholder="…or paste PGN here (variations are kept)" value={pgn} onChange={(e) => setPgn(e.target.value)} />
      <button disabled={!pgn.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Importing…' : 'Import'}
      </button>
      {mutation.error && <p className="error">{String(mutation.error)}</p>}
      {result && (
        <p>
          {result.games} game(s): {result.added} moves added, {result.duplicates} already known
          {result.unreachable > 0 && `, ${result.unreachable} skipped (not reachable from the initial position)`}
          {result.conflicts > 0 && `, ${result.conflicts} position(s) with several moves for your side`}.
          {result.errors.length > 0 && <span className="error"> {result.errors.join('; ')}</span>}
        </p>
      )}
    </details>
  );
}
