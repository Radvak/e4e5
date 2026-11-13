import { playUci, Repertoire, START_FEN, totalGames, pathTo, turnOf, type PlayedMove } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type ImportResult, type Me, type StoredMove } from '../api';
import { ARROWS, OUTLINE_EXTRA, type ArrowKind } from '../components/arrows';
import { EnginePanel } from '../components/EnginePanel';
import { useEngine } from '../engine/useEngine';
import { Board } from '../components/Board';
import { ExplorerPanel } from '../components/ExplorerPanel';
import { explorerParams, useSettings } from '../settings';
import { Suggestions } from '../components/Suggestions';
import { Button, Menu, PageHeader, plural } from '../ui';
import { depthText, useGaps } from '../useGaps';

/** A move of the line on the board; saved or not is derived from the repertoire. */
type LineMove = PlayedMove;

export function RepertoireEditor({ me }: { me: Me }) {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { speed, range, gapCutoff } = useSettings();
  const gapReport = useGaps(me);
  const { data, isLoading, error } = useQuery({ queryKey: ['repertoire', id], queryFn: () => api.repertoire(id) });
  /**
   * The line on the board and the cursor in it. Moves played on the board are a draft: they are
   * only added to the repertoire with "Save variation". Going back keeps the line, so you can
   * step forward through it again.
   */
  const [line, setLine] = useState<LineMove[]>([]);
  const [ply, setPly] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const rep = useMemo(() => new Repertoire(data?.color ?? 'white', data?.moves ?? []), [data]);

  // ?fen=<position>: open the editor on that position (e.g. from the training progress).
  // ?line=<uci,uci,…>: open it on that line from the initial position; moves not in the
  // repertoire are a draft (e.g. a hole from the gap finder, possibly prepared elsewhere).
  const [params, setParams] = useSearchParams();
  const openFen = params.get('fen');
  const openLine = params.get('line');
  useEffect(() => {
    if ((!openFen && !openLine) || !data) return;
    const path: PlayedMove[] | null = openFen ? pathTo(rep, openFen) : [];
    for (const uci of path && openLine ? openLine.split(',') : []) {
      const move = playUci(path!.at(-1)?.toFen ?? START_FEN, uci);
      if (!move) break;
      path!.push(move);
    }
    if (path) {
      setLine(path);
      setPly(path.length);
    }
    setParams({}, { replace: true });
  }, [openFen, openLine, data]);
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
      setNotice(`${plural(r.added, 'coup enregistré', 'coups enregistrés')}.`);
    },
  });
  const renameRep = useMutation({
    mutationFn: (name: string) => api.renameRepertoire(id, name),
    onSuccess: () => Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['repertoires'] })]),
  });
  const deleteRep = useMutation({
    mutationFn: () => api.deleteRepertoire(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['repertoires'] });
      navigate('/repertoires');
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
  /**
   * Next moves to choose from with the keyboard: the line's next move if it is not saved yet,
   * then the repertoire moves (main first). ↑/↓ change the choice, → plays it.
   */
  const options: PlayedMove[] = useMemo(() => {
    const next = line[ply];
    const draft = next && !here.some((m) => m.uci === next.uci) ? [next] : [];
    return [...draft, ...here];
  }, [line, ply, here]);
  const [choice, setChoice] = useState<{ fen: string; index: number } | null>(null);
  const defaultChoice = Math.max(0, options.findIndex((m) => m.uci === line[ply]?.uci));
  const selected = choice && choice.fen === fen ? Math.min(choice.index, options.length - 1) : defaultChoice;
  const choose = (delta: number) => {
    if (options.length < 2) return;
    setChoice({ fen, index: (selected + delta + options.length) % options.length });
  };

  const forward = useCallback(() => {
    const move = options[selected];
    if (move) play(move.uci);
  }, [options, selected, play]);

  /** Drops the unsaved moves: back to the longest saved part of the line. */
  const discard = () => {
    const firstUnsaved = line.findIndex((m) => !rep.has(m.fromFen, m.uci));
    if (firstUnsaved < 0) return;
    setLine(line.slice(0, firstUnsaved));
    setPly(Math.min(ply, firstUnsaved));
  };

  /** Plays several moves from the cursor (engine line), following the current line if it matches. */
  const playMoves = (moves: PlayedMove[]) => {
    setNotice(null);
    const follows = moves.every((m, i) => line[ply + i]?.uci === m.uci);
    if (!follows) setLine([...line.slice(0, ply), ...moves]);
    setPly(ply + moves.length);
  };
  const jumpTo = (moves: PlayedMove[]) => {
    setNotice(null);
    setLine(moves);
    setPly(moves.length);
  };

  const [engineOn, setEngineOn] = useState(() => localStorage.getItem('engine') === 'on');
  const toggleEngine = (on: boolean) => {
    localStorage.setItem('engine', on ? 'on' : 'off');
    setEngineOn(on);
  };
  const engine = useEngine(fen, engineOn);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input')) return;
      if (e.key.startsWith('Arrow')) e.preventDefault(); // no page scroll
      if (e.key === 'ArrowLeft') goTo(ply - 1);
      if (e.key === 'ArrowRight') forward();
      if (e.key === 'ArrowDown') choose(1);
      if (e.key === 'ArrowUp') choose(-1);
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
    const arrow = (uci: string, brush: ArrowKind | 'outline', lineWidth: number): DrawShape => ({
      orig: uci.slice(0, 2) as Key,
      dest: uci.slice(2, 4) as Key,
      brush,
      modifiers: { lineWidth },
    });
    // The move → plays gets a thin white outline (same colour and width: width encodes popularity).
    const next = options[selected];
    const out = here
      .filter((m) => m.uci !== next?.uci)
      .map((m) => arrow(m.uci, 'repertoire', width(share.get(m.uci) ?? 0, 9)));
    // Drawn last, so its outline stays visible over an arrow on the same line.
    if (next) {
      const w = width(share.get(next.uci) ?? 0, 9);
      out.push(arrow(next.uci, 'outline', w + OUTLINE_EXTRA), arrow(next.uci, 'next', w));
    }
    for (const m of ed?.moves.slice(0, 6) ?? []) {
      const s = share.get(m.uci) ?? 0;
      if (s >= 0.03 && !rep.has(fen, m.uci) && m.uci !== next?.uci) out.push(arrow(m.uci, 'popular', width(s)));
    }
    const best = engineOn ? engine.lines[0]?.pv[0] : undefined;
    if (best) out.push(arrow(best.uci, 'engine', 6));
    return out;
  }, [explorer.data, rep, fen, here, engineOn, engine.lines[0]?.pv[0]?.uci, options, selected]);

  if (isLoading) return <p className="muted">Chargement…</p>;
  const colorReport = data ? gapReport.data?.[data.color] : undefined;
  const holes = colorReport?.gaps.filter((g) => g.repertoireId === id);
  const depth = colorReport?.repertoires.find((x) => x.id === id && x.share > 0)?.depth;
  if (error || !data) return <p className="error">Impossible de charger le répertoire.</p>;

  const myTurn = turnOf(fen) === data.color;
  const last = line[ply - 1];
  const lastStored = last ? storedMove(last) : undefined;

  return (
    <>
    <PageHeader
      back="/repertoires"
      title={data.name}
      subtitle={`${data.color === 'white' ? 'Blancs' : 'Noirs'} · ${plural(rep.size, 'coup', 'coups')}${depth !== undefined ? ` · profondeur ${depthText(depth)}` : ''}`}
      actions={<Button variant="primary" icon="play" to={`/r/${id}/train`}>S’entraîner</Button>}
      menu={[
        ...(ply > 0 && unsaved.length === 0
          ? [{ label: 'S’entraîner à partir d’ici', to: `/r/${id}/train?from=${encodeURIComponent(fen)}` }]
          : []),
        { label: 'Importer un PGN', onClick: () => setImportOpen(true) },
        { label: 'Exporter en PGN', onClick: () => (location.href = `/api/repertoires/${id}/pgn`) },
        {
          label: 'Renommer',
          onClick: () => {
            const next = prompt('Nouveau nom', data.name)?.trim();
            if (next && next !== data.name) renameRep.mutate(next);
          },
        },
        {
          label: 'Supprimer le répertoire',
          danger: true,
          onClick: () => confirm(`Supprimer le répertoire « ${data.name} » et tous ses coups ?`) && deleteRep.mutate(),
        },
      ]}
    />
    {importOpen && <PgnImport repertoireId={id} onDone={refresh} onClose={() => setImportOpen(false)} />}
    <div className="editor">
      <div className="editor-board">
        <Board fen={fen} orientation={data.color} lastMove={last?.uci} shapes={shapes} onMove={play} />
        <div className="nav">
          <button onClick={() => goTo(0)} title="Début (Origine)">⏮</button>
          <button onClick={() => goTo(ply - 1)} title="Reculer (←)">◀</button>
          <button onClick={forward} title="Avancer (→)">▶</button>
          <button onClick={() => goTo(line.length)} title="Fin de la ligne (Fin)">⏭</button>
        </div>
        <p className="legend muted">
          {(Object.keys(ARROWS) as ArrowKind[]).filter((k) => k !== 'engine' || engineOn).map((k) => (
            <span key={k} className="legend-item">
              <span className={`swatch ${k === 'next' ? 'outlined' : ''}`} style={{ background: ARROWS[k].color }} />
              {ARROWS[k].label}
            </span>
          ))}
          <span className="legend-item">plus épais = joué plus souvent</span>
        </p>
      </div>

      <div className="editor-side">
        <section className="panel">
          <div className="moves-path">
            <button className={`link ${ply === 0 ? 'current' : ''}`} onClick={() => goTo(0)}>Début</button>
            {line.map((m, i) => (
              <button
                key={i}
                className={['link', rep.has(m.fromFen, m.uci) ? '' : 'unsaved', i === ply - 1 ? 'current' : '', i >= ply ? 'ahead' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => goTo(i + 1)}
                title={rep.has(m.fromFen, m.uci) ? 'Dans votre répertoire' : 'Pas enregistré'}
              >
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{m.san}
              </button>
            ))}
          </div>

          {unsaved.length > 0 && (
            <div className="draft">
              <button className="primary" disabled={saveLine.isPending} onClick={() => saveLine.mutate()}>
                Enregistrer la variante ({plural(unsaved.length, 'nouveau coup', 'nouveaux coups')})
              </button>
              <Button size="sm" variant="ghost" onClick={discard}>Annuler</Button>
            </div>
          )}
          {notice && <p className="muted small-text">{notice}</p>}
          {saveLine.error && <p className="error">{saveLine.error.message}</p>}
          {lastStored && (
            <CommentBox key={lastStored.id} move={lastStored} onSave={(comment) => setComment.mutate({ m: lastStored, comment })} />
          )}
        </section>

        <section className="panel">
          <h3>{myTurn ? 'Votre coup' : 'Réponses adverses'} dans votre répertoire</h3>
          {here.length === 0 && (
            <p className="muted">Rien de préparé ici. Jouez des coups sur l’échiquier, puis « Enregistrer la variante ».</p>
          )}
          <ul className="rep-moves">
            {options[0] && !rep.has(options[0].fromFen, options[0].uci) && (
              <li className={selected === 0 ? 'selected' : ''}>
                <button className="link unsaved san" onClick={() => play(options[0]!.uci)}>{options[0].san}</button>
                <span className="muted small-text" style={{ margin: 0 }}>suite de votre ligne, pas enregistrée</span>
              </li>
            )}
            {here.map((m) => (
              <li key={m.id} className={options[selected]?.uci === m.uci ? 'selected' : ''}>
                <button className="link san" onClick={() => play(m.uci)}>{m.san}</button>
                {m.isMain && <span className="badge">principal</span>}
                {m.comment && <span className="comment" style={{ flex: '1 1 100%' }}>{m.comment}</span>}
                <span className="spacer" />
                <Menu
                  items={[
                    ...(m.isMain ? [] : [{ label: 'Rendre principal', onClick: () => setMain.mutate(m) }]),
                    {
                      label: 'Supprimer ce coup et la suite',
                      danger: true,
                      onClick: () => confirm(`Supprimer ${m.san} et les lignes qui suivent ?`) && deleteMove.mutate(m),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
          {options.length > 0 && (
            <p className="muted small-text keys">
              {options.length > 1 && <><kbd>↑</kbd><kbd>↓</kbd> choisir · </>}
              <kbd>→</kbd> jouer · <kbd>←</kbd> reculer
            </p>
          )}
        </section>

        <Suggestions
          gaps={holes}
          fen={fen}
          cutoff={gapCutoff}
          pending={!!colorReport?.pending}
          onOpen={(ucis) => {
            const moves: PlayedMove[] = [];
            for (const uci of ucis) {
              const m = playUci(moves.at(-1)?.toFen ?? START_FEN, uci);
              if (!m) break;
              moves.push(m);
            }
            jumpTo(moves);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />

        <EnginePanel
          enabled={engineOn}
          onToggle={toggleEngine}
          lines={engine.lines}
          depth={engine.depth}
          maxDepth={engine.maxDepth}
          firstMoveNumber={ply}
          onPlay={playMoves}
          hint="Touchez un coup pour jouer la ligne jusqu’à lui (en variante non enregistrée)."
        />

        <ExplorerPanel
          fen={fen}
          rep={rep}
          stats={explorer.data}
          error={explorer.error}
          loading={explorer.isLoading}
          me={me}
          onPick={play}
        />

      </div>
    </div>
    </>
  );
}

function CommentBox({ move, onSave }: { move: StoredMove; onSave: (comment: string) => void }) {
  const [text, setText] = useState(move.comment ?? '');
  return (
    <div className="comment-box">
      <textarea
        placeholder={`Commentaire sur ${move.san}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (move.comment ?? '') && onSave(text)}
        rows={2}
      />
    </div>
  );
}

/** Opened from the ⋯ menu of the header. */
function PgnImport({ repertoireId, onDone, onClose }: { repertoireId: string; onDone: () => void; onClose: () => void }) {
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
    <section className="card pgn-import">
      <div className="card-head">
        <h3>Importer un PGN</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
      <input
        type="file"
        accept=".pgn,text/plain"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) setPgn(await file.text());
        }}
      />
      <textarea rows={6} placeholder="… ou collez le PGN ici (les variantes sont gardées)" value={pgn} onChange={(e) => setPgn(e.target.value)} />
      <button disabled={!pgn.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Import…' : 'Importer'}
      </button>
      {mutation.error && <p className="error">{String(mutation.error)}</p>}
      {result && (
        <p>
          {plural(result.games, 'partie', 'parties')} : {plural(result.added, 'coup ajouté', 'coups ajoutés')}, {result.duplicates} déjà connus
          {result.unreachable > 0 && `, ${result.unreachable} ignorés (inaccessibles depuis la position initiale)`}
          .
          {result.errors.length > 0 && <span className="error"> {result.errors.join('; ')}</span>}
        </p>
      )}
    </section>
  );
}
