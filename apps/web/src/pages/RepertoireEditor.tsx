import { playUci, Repertoire, START_FEN, totalGames, trainingPositions, turnOf, type PlayedMove } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type ImportResult, type Me, type StoredMove } from '../api';
import { ARROWS, type ArrowKind } from '../components/arrows';
import { Board } from '../components/Board';
import { ExplorerPanel } from '../components/ExplorerPanel';
import { explorerParams, useSettings } from '../settings';

/** A move of the line on the board; saved or not is derived from the repertoire. */
type LineMove = PlayedMove;

export function RepertoireEditor({ me }: { me: Me }) {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { speed, range } = useSettings();
  const { data, isLoading, error } = useQuery({ queryKey: ['repertoire', id], queryFn: () => api.repertoire(id) });
  /**
   * The line on the board and the cursor in it. Moves played on the board are a draft: they are
   * only added to the repertoire with "Save variation". Going back keeps the line, so you can
   * step forward through it again.
   */
  const [line, setLine] = useState<LineMove[]>([]);
  const [ply, setPly] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const rep = useMemo(() => new Repertoire(data?.color ?? 'white', data?.moves ?? []), [data]);

  // ?fen=<position>: open the editor on that position (e.g. from the training progress).
  const [params, setParams] = useSearchParams();
  const openFen = params.get('fen');
  useEffect(() => {
    if (!openFen || !data) return;
    const target = trainingPositions(rep).find((p) => p.fen === openFen);
    if (target) {
      setLine(target.path);
      setPly(target.path.length);
    }
    setParams({}, { replace: true });
  }, [openFen, data]);
  const stored = useMemo(() => new Map((data?.moves ?? []).map((m) => [`${m.fromFen} ${m.uci}`, m])), [data]);
  const storedMove = (m: LineMove) => stored.get(`${m.fromFen} ${m.uci}`);
  const fen = line[ply - 1]?.toFen ?? START_FEN;
  const here = rep.movesAt(fen) as StoredMove[];
  const shown = line.slice(0, ply);
  const unsaved = shown.filter((m) => !rep.has(m.fromFen, m.uci));

  const ex = explorerParams(me, speed, range);
  const explorer = useQuery({
    queryKey: ['explorer', fen, ex.speeds, ex.ratings],
    queryFn: () => api.explorer(fen, ex.speeds, ex.ratings),
    staleTime: Infinity,
    retry: false,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['repertoire', id] });
  const saveLine = useMutation({
    mutationFn: () => api.saveLine(id, shown.map((m) => m.uci)),
    onSuccess: async (r) => {
      await refresh();
      setNotice(`${r.added} move(s) saved.`);
    },
  });
  const deleteMove = useMutation({ mutationFn: (m: StoredMove) => api.deleteMove(id, m.id), onSuccess: refresh });
  const setMain = useMutation({ mutationFn: (m: StoredMove) => api.updateMove(id, m.id, { isMain: true }), onSuccess: refresh });
  const setComment = useMutation({
    mutationFn: ({ m, comment }: { m: StoredMove; comment: string }) => api.updateMove(id, m.id, { comment: comment || null }),
    onSuccess: refresh,
  });

  const goTo = (n: number) => {
    setPly(Math.max(0, Math.min(n, line.length)));
    setNotice(null);
  };

  /** Plays a move at the cursor: follows the line if it is the next move, else branches off. */
  const play = useCallback(
    (uci: string) => {
      setNotice(null);
      if (line[ply]?.uci === uci) return setPly(ply + 1);
      const move = playUci(fen, uci);
      if (!move) return;
      setLine([...line.slice(0, ply), move]);
      setPly(ply + 1);
    },
    [line, ply, fen],
  );

  /** Next move: the line's, else the repertoire main line. */
  const forward = useCallback(() => {
    if (line[ply]) return setPly(ply + 1);
    if (here[0]) play(here[0].uci);
  }, [line, ply, here, play]);

  /** Drops the unsaved moves: back to the longest saved part of the line. */
  const discard = () => {
    const firstUnsaved = line.findIndex((m) => !rep.has(m.fromFen, m.uci));
    if (firstUnsaved < 0) return;
    setLine(line.slice(0, firstUnsaved));
    setPly(Math.min(ply, firstUnsaved));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input')) return;
      if (e.key === 'ArrowLeft') goTo(ply - 1);
      if (e.key === 'ArrowRight') forward();
      if (e.key === 'Home') goTo(0);
      if (e.key === 'End') goTo(line.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Warn before leaving the page with an unsaved variation.
  const hasDraft = line.some((m) => !rep.has(m.fromFen, m.uci));
  useEffect(() => {
    if (!hasDraft) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDraft]);

  /**
   * Arrows: green = move in the repertoire (thicker = more popular), orange = popular move
   * (3%+ of games) that is not in the repertoire.
   */
  const shapes = useMemo<DrawShape[]>(() => {
    const ed = explorer.data?.data;
    const total = ed ? totalGames(ed) : 0;
    const share = new Map((ed?.moves ?? []).map((m) => [m.uci, total ? totalGames(m) / total : 0]));
    // Thicker = played more often; repertoire arrows never get thinner than 9.
    const width = (s: number, min = 5) => Math.max(min, Math.round(5 + 11 * s));
    const arrow = (uci: string, brush: ArrowKind, lineWidth: number): DrawShape => ({
      orig: uci.slice(0, 2) as Key,
      dest: uci.slice(2, 4) as Key,
      brush,
      modifiers: { lineWidth },
    });
    const out = here.map((m) => arrow(m.uci, 'repertoire', width(share.get(m.uci) ?? 0, 9)));
    for (const m of ed?.moves.slice(0, 6) ?? []) {
      const s = share.get(m.uci) ?? 0;
      if (s >= 0.03 && !rep.has(fen, m.uci)) out.push(arrow(m.uci, 'popular', width(s)));
    }
    return out;
  }, [explorer.data, rep, fen, here]);

  if (isLoading) return <p>Loading…</p>;
  if (error || !data) return <p className="error">Could not load the repertoire.</p>;

  const myTurn = turnOf(fen) === data.color;
  const last = line[ply - 1];
  const lastStored = last ? storedMove(last) : undefined;

  return (
    <div className="editor">
      <div className="editor-board">
        <Board fen={fen} orientation={data.color} lastMove={last?.uci} shapes={shapes} onMove={play} />
        <div className="nav">
          <button onClick={() => goTo(0)} title="Start (Home)">⏮</button>
          <button onClick={() => goTo(ply - 1)} title="Back (←)">◀</button>
          <button onClick={forward} title="Forward (→)">▶</button>
          <button onClick={() => goTo(line.length)} title="End of the line (End)">⏭</button>
        </div>
        <p className="legend muted">
          {(Object.keys(ARROWS) as ArrowKind[]).map((k) => (
            <span key={k} className="legend-item">
              <span className="swatch" style={{ background: ARROWS[k].color }} />
              {ARROWS[k].label}
            </span>
          ))}
          <span className="legend-item">thicker = played more often</span>
        </p>
      </div>

      <div className="editor-side">
        <header className="row">
          <Link to="/">← Repertoires</Link>
          <h2>{data.name}</h2>
          <span className="muted">({data.color}, {rep.size} moves)</span>
          <Link className="button primary" to={`/r/${id}/train`}>Train</Link>
          {ply > 0 && (
            <Link className="button" to={`/r/${id}/train?from=${encodeURIComponent(fen)}`} title="Train only the lines after this position">
              Train from here
            </Link>
          )}
          <a className="button" href={`/api/repertoires/${id}/pgn`}>Export PGN</a>
        </header>

        <section className="panel">
          <div className="moves-path">
            <button className={`link ${ply === 0 ? 'current' : ''}`} onClick={() => goTo(0)}>Start</button>
            {line.map((m, i) => (
              <button
                key={i}
                className={['link', rep.has(m.fromFen, m.uci) ? '' : 'unsaved', i === ply - 1 ? 'current' : '', i >= ply ? 'ahead' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => goTo(i + 1)}
                title={rep.has(m.fromFen, m.uci) ? 'In your repertoire' : 'Not saved'}
              >
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{m.san}
              </button>
            ))}
          </div>

          {unsaved.length > 0 && (
            <div className="draft">
              <button className="primary" disabled={saveLine.isPending} onClick={() => saveLine.mutate()}>
                Save variation ({unsaved.length} new move{unsaved.length > 1 ? 's' : ''})
              </button>
              <button className="small" onClick={discard}>Discard</button>
            </div>
          )}
          {notice && <p className="muted small-text">{notice}</p>}
          {saveLine.error && <p className="error">{saveLine.error.message}</p>}
          {lastStored && (
            <CommentBox key={lastStored.id} move={lastStored} onSave={(comment) => setComment.mutate({ m: lastStored, comment })} />
          )}
        </section>

        <section className="panel">
          <h3>{myTurn ? 'Your move' : 'Opponent replies'} in your repertoire</h3>
          {here.length === 0 && (
            <p className="muted">Nothing prepared here. Play moves on the board, then “Save variation”.</p>
          )}
          <ul className="rep-moves">
            {here.map((m) => (
              <li key={m.id}>
                <button className="link" onClick={() => play(m.uci)}>{m.san}</button>
                {m.isMain ? <span className="muted"> main</span> : (
                  <button className="small" onClick={() => setMain.mutate(m)}>make main</button>
                )}
                {m.comment && <span className="comment"> {m.comment}</span>}
                <button
                  className="small danger"
                  onClick={() => confirm(`Delete ${m.san} and the lines after it from the repertoire?`) && deleteMove.mutate(m)}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        </section>

        <ExplorerPanel
          fen={fen}
          rep={rep}
          stats={explorer.data}
          error={explorer.error}
          loading={explorer.isLoading}
          ratings={ex.ratings}
          note={
            !ex.auto
              ? `Custom range, ${ex.speeds.join('+')} games.`
              : ex.source
                ? `Default: around your ${ex.source} ${ex.speeds.join('+')} rating (${ex.rating}).`
                : `Default: around 1500 (no rating known).`
          }
          onPick={play}
        />

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
          .
          {result.errors.length > 0 && <span className="error"> {result.errors.join('; ')}</span>}
        </p>
      )}
    </details>
  );
}
