import { playUci, Repertoire, START_FEN, totalGames, pathTo, type PlayedMove } from '@tabiya/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type Gap, type ImportResult, type Me, type RepertoireDetail, type StoredMove } from '../api';
import { useMoveDrag, type DropTarget } from '../components/useMoveDrag';
import { OUTLINE_EXTRA, type ArrowKind } from '../components/arrows';
import { EngineLines, EngineToggle } from '../components/EnginePanel';
import { useEngine } from '../engine/useEngine';
import { Board } from '../components/Board';
import { San } from '../components/Nag';
import { ExplorerPanel } from '../components/ExplorerPanel';
import { explorerParams, rangeLabel, useSettings } from '../settings';
import { LEVEL_STEPS, LevelToggle, topLevelMove, useBestMoves, useLevelDepth, useLevelToggle } from '../components/BestMoves';
import { Suggestions } from '../components/Suggestions';
import { Button, Icon, Menu, PageHeader, plural } from '../ui';
import { useGaps } from '../useGaps';


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
  /** Move whose comment is being written (id), or null. */
  const [commentEdit, setCommentEdit] = useState<number | null>(null);

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
  // The moves trained (main first), then the paused ones.
  const atFen = rep.movesAt(fen) as StoredMove[];
  const here = [...atFen.filter((m) => !m.paused), ...atFen.filter((m) => m.paused)];
  const shown = line.slice(0, ply);
  const unsaved = shown.filter((m) => !rep.has(m.fromFen, m.uci));

  const ex = explorerParams(me, speed, range);
  const explorer = useQuery({
    queryKey: ['explorer', fen, ex.speeds, ex.ratings],
    queryFn: () => api.explorer(fen, ex.speeds, ex.ratings),
    staleTime: Infinity,
    retry: false,
  });

  // The moves changed: the repertoire, and what depends on it (missing moves, lines to train, list).
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['repertoire', id] }),
      qc.invalidateQueries({ queryKey: ['gaps'] }),
      qc.invalidateQueries({ queryKey: ['training-summary'] }),
      qc.invalidateQueries({ queryKey: ['repertoires'] }),
    ]);
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
  const toggleActive = useMutation({
    mutationFn: () => api.setRepertoireActive(id, !data!.active),
    onSuccess: () =>
      Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['repertoires'] }), qc.invalidateQueries({ queryKey: ['training-summary'] })]),
  });
  const deleteRep = useMutation({
    mutationFn: () => api.deleteRepertoire(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['repertoires'] });
      navigate('/repertoires');
    },
  });
  const deleteMove = useMutation({ mutationFn: (m: StoredMove) => api.deleteMove(id, m.id), onSuccess: refresh });
  /**
   * Main and paused moves, set by dragging the moves of a position (see dropMove). Shown at once
   * (same rules as the server: the main move is never paused, pausing it hands the main line to
   * the first other move still trained), then reloaded.
   */
  const arrange = useMutation({
    mutationFn: async (patches: MovePatch[]) => {
      for (const p of patches) await api.updateMove(id, p.m.id, p.patch);
    },
    onMutate: (patches) => {
      qc.setQueryData<RepertoireDetail>(['repertoire', id], (d) => d && { ...d, moves: patches.reduce(applyPatch, d.moves) });
    },
    onSettled: refresh,
  });
  /**
   * A move dropped in the list of its position: at the top of the moves trained, it becomes the
   * main move; in the paused zone, it is paused (it and what only follows it are not trained).
   */
  const dropMove = (moveId: number, target: DropTarget) => {
    const m = here.find((x) => x.id === moveId);
    if (!m) return;
    const active = here.filter((x) => !x.paused);
    if (target.zone === 'paused') {
      if (!m.paused) arrange.mutate([{ m, patch: { paused: true } }]);
    } else if (target.index === 0) {
      if (m.paused || !m.isMain) arrange.mutate([{ m, patch: { isMain: true } }]);
    } else if (m.paused) {
      arrange.mutate([{ m, patch: { paused: false } }]);
    } else if (active[0]?.id === m.id && active[1]) {
      // The main move dropped lower: the move now on top becomes the main one.
      arrange.mutate([{ m: active[1], patch: { isMain: true } }]);
    }
  };
  const { listRef, drag, handle } = useMoveDrag(dropMove);
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
  // Moves at my level (Lichess explorer): only on my turn, and only when asked (many requests).
  // The toggle (on for the browser session only) shows the statistics card under the board, like
  // the engine's; its box follows the likely lines or not (kept on this device; off: the moves' own
  // win rates, no search).
  const [levelOn, toggleLevel] = useLevelToggle();
  const [levelDepth, onDepth] = useLevelDepth();
  const depth = levelOn ? levelDepth : 0;
  const myTurn = rep.isMyTurn(fen);
  const level = useBestMoves(fen, ex.speeds, ex.ratings, depth > 0 && myTurn, depth);
  const levelBest = depth > 0 && myTurn ? topLevelMove(level.data) : undefined;

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
      if (e.key === 'e') toggleEngine(!engineOn);
      if (e.key === 'n') toggleLevel(!levelOn);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Warn before leaving the page with an unsaved variation.
  const hasDraft = line.some((m) => !rep.has(m.fromFen, m.uci));
  /** The saved moves of the line up to the cursor (all of them when there is no draft). */
  const shownStored = shown.map(storedMove).filter((m): m is StoredMove => !!m);
  useEffect(() => {
    if (!hasDraft) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDraft]);

  /** Missing moves here (gap finder, "Coups manquants"): the opponent moves not prepared yet. */
  const missingHere = useMemo(
    () =>
      new Set(
        (gapReport.data?.[rep.color]?.gaps ?? [])
          .filter((g) => g.repertoireId === id && g.fen === fen && g.move && !rep.has(fen, g.move.uci))
          .map((g) => g.move!.uci),
      ),
    [gapReport.data, rep, id, fen],
  );

  /**
   * Arrows: green = move in the repertoire (thicker = more popular), orange = missing move (gap
   * finder) or next move of the line not saved yet.
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
      .map((m) => arrow(m.uci, m.paused ? 'paused' : 'repertoire', width(share.get(m.uci) ?? 0, 9)));
    // Drawn last, so its outline stays visible over an arrow on the same line.
    if (next) {
      const w = width(share.get(next.uci) ?? 0, 9);
      const saved = here.find((m) => m.uci === next.uci);
      out.push(arrow(next.uci, 'outline', w + OUTLINE_EXTRA), arrow(next.uci, !saved ? 'nextDraft' : saved.paused ? 'paused' : 'next', w));
    }
    // Orange: the missing moves only (those of "Coups manquants").
    for (const uci of missingHere) if (uci !== next?.uci) out.push(arrow(uci, 'popular', width(share.get(uci) ?? 0)));
    // Level under engine: wider, so both show when they agree.
    if (levelBest) out.push(arrow(levelBest.uci, 'level', 9));
    const best = engineOn ? engine.lines[0]?.pv[0] : undefined;
    if (best) out.push(arrow(best.uci, 'engine', 6));
    return out;
  }, [explorer.data, rep, fen, here, engineOn, engine.lines[0]?.pv[0]?.uci, levelBest?.uci, options, selected, missingHere]);

  if (isLoading) return <p className="muted">Chargement…</p>;
  const colorReport = data ? gapReport.data?.[data.color] : undefined;
  // Without the holes the repertoire covers now (saved since the report: hidden at once, until the
  // report is computed again): the opponent move added (or a transposition), or my answer.
  const covered = (g: Gap) => {
    if (!g.move) return rep.movesAt(g.fen).length > 0;
    const after = playUci(g.fen, g.move.uci)?.toFen;
    return rep.has(g.fen, g.move.uci) || (!!after && rep.movesAt(after).length > 0);
  };
  const holes = colorReport?.gaps.filter((g) => g.repertoireId === id && !covered(g));
  if (error || !data) return <p className="error">Impossible de charger le répertoire.</p>;

  const last = line[ply - 1];
  const lastStored = last ? storedMove(last) : undefined;

  return (
    <>
    <PageHeader
      back="/repertoires"
      title={data.name}
      subtitle={`${data.color === 'white' ? 'Blancs' : 'Noirs'} · ${plural(rep.size, 'coup', 'coups')}${data.active ? '' : ' · en pause'}`}
      actions={<Button variant="primary" icon="play" to={`/r/${id}/train`}>S’entraîner</Button>}
      menu={[
        ...(ply > 0 && unsaved.length === 0
          ? [{ label: 'S’entraîner à partir d’ici', to: `/r/${id}/train?from=${encodeURIComponent(fen)}` }]
          : []),
        { label: 'Importer un PGN', onClick: () => setImportOpen(true) },
        { label: 'Exporter en PGN', onClick: () => (location.href = `/api/repertoires/${id}/pgn`) },
        { label: data.active ? 'Mettre en pause' : 'Reprendre l’entraînement', onClick: () => toggleActive.mutate() },
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
          <EngineToggle enabled={engineOn} onToggle={toggleEngine} />
          <LevelToggle enabled={levelOn} onToggle={toggleLevel} />
        </div>
        <EngineLines
          enabled={engineOn}
          lines={engine.lines}
          depth={engine.depth}
          maxDepth={engine.maxDepth}
          firstMoveNumber={ply}
          onPlay={playMoves}
        />
        {levelOn && (
          <ExplorerPanel
            fen={fen}
            color={rep.color}
            inRep={(uci) => rep.has(fen, uci)}
            nagsOf={(uci) => rep.movesAt(fen).find((m) => m.uci === uci)?.nags}
            stats={explorer.data}
            error={explorer.error}
            loading={explorer.isLoading}
            onPick={play}
            isMissing={(uci) => missingHere.has(uci)}
            firstMoveNumber={ply}
            onPlay={playMoves}
            level={{
              data: level.data,
              loading: level.isLoading,
              error: level.error,
              depth,
              maxDepth: LEVEL_STEPS,
              onDepth,
              canSearch: myTurn,
              range: rangeLabel(ex.ratings),
              engineBest: engineOn ? engine.lines[0]?.pv[0]?.uci : undefined,
            }}
          />
        )}
      </div>

      <div className="editor-side">
        <section className="panel">
          <h3>Dans votre répertoire</h3>
          {line.length > 0 && (
          <div className="line-row">
          <div className="moves-path">
            {line.map((m, i) => {
              const stored = rep.movesAt(m.fromFen).find((x) => x.uci === m.uci);
              // Paused: the move itself (pause icon), and what follows it on the line (greyed).
              const pausedAt = line.findIndex((x) => rep.movesAt(x.fromFen).some((y) => y.uci === x.uci && y.paused));
              return (
                <button
                  key={i}
                  className={[
                    'link',
                    stored ? '' : 'unsaved',
                    i === ply - 1 ? 'current' : '',
                    i >= ply ? 'ahead' : '',
                    pausedAt >= 0 && i >= pausedAt ? 'in-paused' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => goTo(i + 1)}
                  title={stored?.paused ? 'En pause : ce coup et sa suite ne sont pas entraînés' : stored ? 'Dans votre répertoire' : 'Pas enregistré'}
                >
                  {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                  {stored?.paused && <span className="pause-mark"><Icon name="pause" size={13} /></span>}
                  <San san={m.san} nags={stored?.nags} />
                </button>
              );
            })}
          </div>
          {lastStored && !lastStored.comment && commentEdit !== lastStored.id && (
            <Button size="sm" variant="ghost" icon="pencil" title={`Commenter ${lastStored.san}`} onClick={() => setCommentEdit(lastStored.id)} />
          )}
          </div>
          )}

          {unsaved.length > 0 && (
            <div className="draft">
              <button className="primary" disabled={saveLine.isPending} onClick={() => saveLine.mutate()}>
                Enregistrer la variante
              </button>
              <Button size="sm" variant="ghost" onClick={discard}>Annuler</Button>
            </div>
          )}
          {notice && <p className="muted small-text">{notice}</p>}
          {shownStored.some((m) => m.paused) && (
            <p className="muted small-text">
              <Icon name="pause" size={12} /> Ligne en pause : pas entraînée.
            </p>
          )}
          {saveLine.error && <p className="error">{saveLine.error.message}</p>}
          {lastStored && (
            <CommentNote
              key={lastStored.id}
              move={lastStored}
              editing={commentEdit === lastStored.id}
              onEdit={(on) => setCommentEdit(on ? lastStored.id : null)}
              onSave={(comment) => setComment.mutate({ m: lastStored, comment })}
            />
          )}
          {here.length === 0 && !hasDraft && (
            <>
              <p className="muted">Jouez des coups pour continuer la variante.</p>
              {/* End of the line on my turn: what to play next, from the engine or at my level. */}
              {myTurn && (!engineOn || !levelOn) && (
                <div className="suggest-start muted small-text">
                  Suggérer un coup :
                  {!engineOn && <Button size="sm" icon="engine" onClick={() => toggleEngine(true)}>Stockfish</Button>}
                  {!levelOn && <Button size="sm" icon="level" onClick={() => toggleLevel(true)}>À mon niveau</Button>}
                </div>
              )}
            </>
          )}
          <ul className={`rep-moves ${drag ? 'dragging-list' : ''}`} ref={listRef}>
            {options[0] && !rep.has(options[0].fromFen, options[0].uci) && (
              <li
                className={`clickable draft-move ${selected === 0 ? 'selected' : ''}`}
                onClick={() => play(options[0]!.uci)}
                title="Suite de votre ligne, pas encore enregistrée"
              >
                <div className="move-main">
                  <button className="link unsaved san">{options[0].san}</button>
                </div>
                <div className="row nowrap move-actions" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="close"
                    title="Annuler la suite non enregistrée à partir d’ici"
                    onClick={() => setLine(line.slice(0, ply))}
                  />
                </div>
              </li>
            )}
            {here.map((m, i) => {
              const zone = m.paused ? 'paused' : 'active';
              // Drop indicator: a line before the row the dragged move would land before.
              const others = here.filter((x) => (x.paused ? 'paused' : 'active') === zone && x.id !== drag?.id);
              const rank = others.indexOf(m);
              const dropBefore = !!drag && drag.id !== m.id && drag.zone === 'active' && zone === 'active' && rank === drag.index;
              const dropAfter = !!drag && drag.id !== m.id && drag.zone === 'active' && zone === 'active' && rank === others.length - 1 && drag.index === others.length;
              return (
                <Fragment key={m.id}>
                  {/* The paused zone: always while dragging, so a move can be dropped there. */}
                  {(i === here.findIndex((x) => x.paused)) && <PausedZoneHeader target={drag?.zone === 'paused'} dropAbove={drag?.zone === 'active' && !here.some((x) => !x.paused && x.id !== drag.id)} />}
                  <li
                    data-zone={zone}
                    data-id={m.id}
                    className={[
                      'clickable',
                      options[selected]?.uci === m.uci ? 'selected' : '',
                      m.paused ? 'paused' : '',
                      drag?.id === m.id ? 'dragging' : '',
                      dropBefore ? 'drop-before' : '',
                      dropAfter ? 'drop-after' : '',
                    ].filter(Boolean).join(' ')}
                    style={drag?.id === m.id ? { transform: `translateY(${drag.dy}px)` } : undefined}
                    onClick={() => play(m.uci)}
                  >
                    <span className="grip" title="Glisser : en haut, coup principal ; en bas, en pause" {...handle(m.id)}>
                      <Icon name="grip" size={16} />
                    </span>
                    <div className="move-main">
                      <button className="link san">
                        <San san={m.san} nags={m.nags} />
                      </button>
                      {m.comment && <div className="comment move-comment">{m.comment}</div>}
                    </div>
                    <div className="row nowrap move-actions" onClick={(e) => e.stopPropagation()}>
                      <Menu
                        items={[
                          {
                            label: 'Supprimer ce coup et la suite',
                            danger: true,
                            onClick: () => confirm(`Supprimer ${m.san} et les lignes qui suivent ?`) && deleteMove.mutate(m),
                          },
                        ]}
                      />
                    </div>
                  </li>
                </Fragment>
              );
            })}
            {drag && !here.some((m) => m.paused) && <PausedZoneHeader target={drag.zone === 'paused'} dropAbove={drag.zone === 'active' && !here.some((x) => x.id !== drag.id)} />}
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



      </div>
    </div>
    </>
  );
}

/**
 * Comment of the move leading to the position: shown as text with a pencil to edit it (the
 * pencil to add one sits at the end of the line); the text area only appears while writing.
 */
type MovePatch = { m: StoredMove; patch: { isMain?: boolean; paused?: boolean } };

/** A main / paused change applied to the moves, by the rules of the server (PATCH of a move). */
function applyPatch(moves: StoredMove[], { m, patch }: MovePatch): StoredMove[] {
  const same = (x: StoredMove) => x.fromFen === m.fromFen;
  if (patch.isMain) return moves.map((x) => (x.id === m.id ? { ...x, isMain: true, paused: false } : same(x) ? { ...x, isMain: false } : x));
  if (patch.paused) {
    const wasMain = moves.find((x) => x.id === m.id)?.isMain;
    const heir = wasMain ? moves.find((x) => same(x) && x.id !== m.id && !x.paused) : undefined;
    return moves.map((x) => (x.id === m.id ? { ...x, isMain: false, paused: true } : x === heir ? { ...x, isMain: true } : x));
  }
  return moves.map((x) => (x.id === m.id ? { ...x, ...patch } : x));
}

/** Start of the paused moves of a position: they and what only follows them are not trained. */
function PausedZoneHeader({ target, dropAbove }: { target: boolean; dropAbove: boolean }) {
  return (
    <li data-paused-zone className={['paused-zone', target ? 'drop-target' : '', dropAbove ? 'drop-before' : ''].filter(Boolean).join(' ')}>
      <Icon name="pause" size={13} /> En pause : pas entraînés
    </li>
  );
}

function CommentNote({ move, editing, onEdit, onSave }: { move: StoredMove; editing: boolean; onEdit: (on: boolean) => void; onSave: (comment: string) => void }) {
  const [text, setText] = useState(move.comment ?? '');
  if (!editing) {
    if (!move.comment) return null;
    return (
      <div className="comment-note">
        <span className="comment">{move.comment}</span>
        <Button size="sm" variant="ghost" icon="pencil" title="Modifier le commentaire" onClick={() => onEdit(true)} />
      </div>
    );
  }
  const save = () => {
    if (text.trim() !== (move.comment ?? '')) onSave(text.trim());
    onEdit(false);
  };
  return (
    <div className="comment-box">
      <textarea autoFocus placeholder={`Commentaire sur ${move.san}…`} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <div className="row">
        <Button size="sm" variant="primary" onClick={save}>Enregistrer</Button>
        <Button size="sm" variant="ghost" onClick={() => (setText(move.comment ?? ''), onEdit(false))}>Annuler</Button>
      </div>
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
