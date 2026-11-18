import { playSanOn, playUci, positionFromFen, START_FEN, totalGames, type Color, type PlayedMove } from '@tabiya/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, type ExplorerGameRef, type Me, type MyGameRef, type RepertoireMoveHere } from '../api';
import { isPopular } from '../components/arrows';
import { Board } from '../components/Board';
import { EngineLines, EngineToggle } from '../components/EnginePanel';
import { JumpBox } from '../components/JumpBox';
import { useEngine } from '../engine/useEngine';
import { LevelLines, LevelToggle, topLevelMove, useBestMoves, useLevelToggle } from '../components/BestMoves';
import { MoveTable } from '../components/MoveTable';
import { StatsSource } from '../components/StatsSource';
import { explorerParams, rangeLabel, speedsLabel, useSettings } from '../settings';
import { PageHeader, Tabs } from '../ui';

type Source = 'lichess' | 'mine';

/** Moves from the initial position, as UCI, for links. */
const ucis = (line: PlayedMove[]) => line.map((m) => m.uci).join(',');

function lineFromUcis(text: string | null): PlayedMove[] {
  const line: PlayedMove[] = [];
  for (const uci of text ? text.split(',') : []) {
    const move = playUci(line.at(-1)?.toFen ?? START_FEN, uci);
    if (!move) break;
    line.push(move);
  }
  return line;
}

const STORAGE_KEY = 'explorer';
/** Last explorer state: the whole line (also the moves ahead of the cursor), cursor, orientation. */
interface Saved {
  line: string;
  ply: number;
  orientation: Color;
}

function fromUrl(params: URLSearchParams) {
  const line = lineFromUcis(params.get('line'));
  return { line, ply: line.length, orientation: (params.get('color') === 'black' ? 'black' : 'white') as Color };
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Saved | null;
    if (saved) {
      const line = lineFromUcis(saved.line || null);
      return { line, ply: Math.max(0, Math.min(saved.ply, line.length)), orientation: saved.orientation === 'black' ? 'black' : ('white' as Color) };
    }
  } catch {
    // ignore a corrupt entry
  }
  return { line: [] as PlayedMove[], ply: 0, orientation: 'white' as Color };
}

/**
 * Free exploration of any position: board, the moves of all your repertoires, Lichess
 * statistics (players of your level, or only your own games) and the games behind them.
 */
export function Explorer({ me }: { me: Me }) {
  const { speed, range, gamesSpeeds, gamesDays } = useSettings();
  const ex = explorerParams(me, speed, range);
  const hasAccount = !!me.lichess || !!me.chesscom;
  const [params, setParams] = useSearchParams();
  // The line is kept in the URL (?line=e2e4,e7e5: reload and share keep the position) and in
  // localStorage, to find it again when coming back from another page without one.
  const [initial] = useState(() => (params.get('line') || params.get('color') ? fromUrl(params) : restore()));
  const [line, setLineState] = useState<PlayedMove[]>(initial.line);
  const [ply, setPlyState] = useState(initial.ply);
  const [orientation, setOrientation] = useState<Color>(initial.orientation);
  const [source, setSource] = useState<Source>(() => (localStorage.getItem('explorerSource') === 'mine' ? 'mine' : 'lichess'));
  const [showGames, setShowGames] = useState(false);

  const sync = (l: PlayedMove[], p: number, o = orientation) => {
    setParams({ ...(p ? { line: ucis(l.slice(0, p)) } : {}), ...(o === 'black' ? { color: 'black' } : {}) }, { replace: true });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ line: ucis(l), ply: p, orientation: o } satisfies Saved));
  };
  // Shown in the URL at once when restored from localStorage.
  useEffect(() => sync(line, ply), []);
  const setLine = (l: PlayedMove[], p: number) => {
    setLineState(l);
    setPlyState(p);
    sync(l, p);
  };
  const goTo = (n: number) => {
    const p = Math.max(0, Math.min(n, line.length));
    setPlyState(p);
    sync(line, p);
  };
  const flip = () => {
    const o = orientation === 'white' ? 'black' : 'white';
    setOrientation(o);
    sync(line, ply, o);
  };

  const fen = line[ply - 1]?.toFen ?? START_FEN;
  const shown = line.slice(0, ply);

  /** Plays a move: follows the line if it is its next move, else branches off. */
  const play = (uci: string) => {
    if (line[ply]?.uci === uci) return goTo(ply + 1);
    const move = playUci(fen, uci);
    if (move) setLine([...shown, move], ply + 1);
  };

  const repMoves = useQuery({ queryKey: ['explorer-reps', fen], queryFn: () => api.repertoireMovesAt(fen) });
  const lichess = useQuery({
    queryKey: ['explorer', fen, ex.speeds, ex.ratings],
    queryFn: () => api.explorer(fen, ex.speeds, ex.ratings),
    staleTime: Infinity,
    retry: false,
    enabled: source === 'lichess',
  });
  // My synced games (Lichess and Chess.com), with the games settings of the Parties page.
  const mine = useQuery({
    queryKey: ['explorer-mine', fen, orientation, gamesSpeeds, gamesDays],
    queryFn: () => api.myGames(fen, orientation, gamesSpeeds, gamesDays),
    enabled: source === 'mine' && hasAccount,
    retry: false,
    staleTime: 60_000,
  });
  const games = useQuery({
    queryKey: ['explorer-games', fen, ex.speeds, ex.ratings],
    queryFn: () => api.explorerGames(fen, ex.speeds, ex.ratings),
    enabled: source === 'lichess' && showGames,
    staleTime: Infinity,
    retry: false,
  });

  // Stockfish, with the same on/off setting as the repertoire editor.
  const [engineOn, setEngineOn] = useState(() => localStorage.getItem('engine') === 'on');
  const toggleEngine = (on: boolean) => {
    localStorage.setItem('engine', on ? 'on' : 'off');
    setEngineOn(on);
  };
  const engine = useEngine(fen, engineOn);
  const best = engineOn ? engine.lines[0]?.pv[0] : undefined;
  // Moves at my level for the side to move (Lichess explorer), only when asked.
  const [levelOn, toggleLevel] = useLevelToggle();
  const level = useBestMoves(fen, ex.speeds, ex.ratings, levelOn);
  const levelBest = levelOn ? topLevelMove(level.data) : undefined;
  /** Plays an engine line from the current position (follows the line when it matches). */
  const playMoves = (moves: PlayedMove[]) => {
    const follows = moves.every((m, i) => line[ply + i]?.uci === m.uci);
    if (follows) goTo(ply + moves.length);
    else setLine([...shown, ...moves], ply + moves.length);
  };

  const data = source === 'lichess' ? lichess.data?.data : mine.data?.data;
  const prepared = useMemo(() => groupByMove(repMoves.data ?? []), [repMoves.data]);
  // My move already prepared in a repertoire of the side to move: no popular (orange) moves to suggest.
  const turn: Color = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const markPopular = !(repMoves.data ?? []).some((r) => r.color === turn);

  const shapes = useMemo<DrawShape[]>(() => {
    const total = data ? totalGames(data) : 0;
    const share = new Map((data?.moves ?? []).map((m) => [m.uci, total ? totalGames(m) / total : 0]));
    const width = (s: number, min = 5) => Math.max(min, Math.round(5 + 11 * s));
    const arrow = (uci: string, brush: string, lineWidth: number): DrawShape => ({
      orig: uci.slice(0, 2) as Key,
      dest: uci.slice(2, 4) as Key,
      brush,
      modifiers: { lineWidth },
    });
    const out = [...prepared.keys()].map((uci) => arrow(uci, 'repertoire', width(share.get(uci) ?? 0, 9)));
    for (const [i, m] of (data?.moves ?? []).entries()) {
      const s = share.get(m.uci) ?? 0;
      if (markPopular && isPopular(i, s) && !prepared.has(m.uci)) out.push(arrow(m.uci, 'popular', width(s)));
    }
    if (levelBest) out.push(arrow(levelBest.uci, 'level', 9));
    if (best) out.push(arrow(best.uci, 'engine', 6));
    return out;
  }, [data, prepared, markPopular, best?.uci, levelBest?.uci]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input, select')) return;
      if (e.key.startsWith('Arrow')) e.preventDefault();
      if (e.key === 'ArrowLeft') goTo(ply - 1);
      if (e.key === 'ArrowRight') goTo(ply + 1);
      if (e.key === 'Home') goTo(0);
      if (e.key === 'End') goTo(line.length);
      if (e.key === 'f') flip();
      if (e.key === 'e') toggleEngine(!engineOn);
      if (e.key === 'n') toggleLevel(!levelOn);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Replays a game: its moves become the line, at the current position when it goes through it. */
  const loadGame = useMutation({
    // My synced games (any site) from the database, the others from Lichess.
    mutationFn: (id: string) => (source === 'mine' ? api.myGameMoves(id) : api.lichessGame(id)),
    onSuccess: (g) => {
      const pos = positionFromFen(START_FEN);
      const moves: PlayedMove[] = [];
      for (const san of g.moves) {
        const m = playSanOn(pos, san);
        if (!m) break;
        moves.push(m);
      }
      const here = fen === START_FEN ? 0 : moves.findIndex((m) => m.toFen === fen) + 1;
      setLine(moves, here > 0 ? here : 0);
    },
  });

  const chooseSource = (s: Source) => {
    localStorage.setItem('explorerSource', s);
    setSource(s);
  };
  const last = line[ply - 1];
  const gameList = source === 'lichess' ? games.data : mine.data ? { topGames: [], recentGames: mine.data.recentGames } : undefined;

  return (
    <>
    <PageHeader
      title="Explorer"
      subtitle="Échiquier libre, vos répertoires, statistiques et moteur"
    />
    <div className="editor">
      <div className="editor-board">
        <Board fen={fen} orientation={orientation} lastMove={last?.uci} shapes={shapes} onMove={play} />
        <div className="nav">
          <button onClick={() => goTo(0)} title="Début (Origine)">⏮</button>
          <button onClick={() => goTo(ply - 1)} title="Reculer (←)">◀</button>
          <button onClick={() => goTo(ply + 1)} title="Avancer (→)">▶</button>
          <button onClick={() => goTo(line.length)} title="Fin de la ligne (Fin)">⏭</button>
          <button onClick={flip} title="Retourner l’échiquier (f)">⇅</button>
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
        <LevelLines
          enabled={levelOn}
          fen={fen}
          firstMoveNumber={ply}
          speeds={ex.speeds}
          ratings={ex.ratings}
          range={rangeLabel(ex.ratings)}
          engineBest={best?.uci}
          onPlay={playMoves}
        />
      </div>

      <div className="editor-side">
        <section className="panel">
          <JumpBox onJump={(moves) => setLine(moves, moves.length)} />
          <div className="moves-path">
            <button className={`link ${ply === 0 ? 'current' : ''}`} onClick={() => goTo(0)}>Début</button>
            {line.map((m, i) => (
              <button
                key={i}
                className={['link', i === ply - 1 ? 'current' : '', i >= ply ? 'ahead' : ''].filter(Boolean).join(' ')}
                onClick={() => goTo(i + 1)}
              >
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{m.san}
              </button>
            ))}
          </div>
          <p className="muted small-text keys">
            <kbd>←</kbd><kbd>→</kbd> naviguer · <kbd>f</kbd> retourner · <kbd>e</kbd> moteur · <kbd>n</kbd> à votre niveau
          </p>
        </section>

        <section className="panel">
          <h3>Dans vos répertoires</h3>
          {repMoves.data && prepared.size === 0 && <p className="muted">Aucun répertoire n’a de coup dans cette position.</p>}
          <ul className="rep-moves">
            {[...prepared.values()].map(({ san, uci, reps }) => (
              <li key={uci}>
                <button className="link san" onClick={() => play(uci)}>{san}</button>
                {reps.map((r) => (
                  <Link
                    key={r.repertoireId}
                    className="rep-tag"
                    to={`/r/${r.repertoireId}?${new URLSearchParams({ line: ucis([...shown, playUci(fen, uci)!]) })}`}
                    title={`Ouvrir ${r.name} sur ce coup${r.comment ? ` — ${r.comment}` : ''}`}
                  >
                    <span className={`dot inline ${r.color}`} /> {r.name}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </section>


        <section className="panel">
          <div className="row">
            <Tabs
              value={source}
              onChange={chooseSource}
              tabs={[
                { id: 'lichess', label: 'Joueurs Lichess' },
                { id: 'mine', label: 'Mes parties' },
              ]}
            />
            {data?.opening && <span className="muted small-text" style={{ margin: 0 }}>{data.opening.eco} · {data.opening.name}</span>}
          </div>

          {source === 'lichess' && (
            <>
              <div className="row" style={{ margin: '10px 0' }}>
                <StatsSource me={me} />
              </div>
              {lichess.data && !lichess.data.meta.exact && (
                <p className="warning small-text">Pas de données pour votre tranche : la plus proche est affichée.</p>
              )}
              {lichess.isLoading && <p className="muted">Chargement…</p>}
              {lichess.error && <ErrorText error={lichess.error} />}
            </>
          )}
          {source === 'mine' && (
            <>
              {!hasAccount ? (
                <p className="muted">
                  Liez Lichess ou indiquez votre pseudo Chess.com dans <Link to="/compte#comptes">Mon compte</Link> pour voir vos propres parties.
                </p>
              ) : (
                <p className="muted small-text">
                  Vos parties synchronisées ({[me.lichess && `Lichess ${me.lichess.username}`, me.chesscom && `Chess.com ${me.chesscom.username}`].filter(Boolean).join(', ')}) avec les{' '}
                  <strong>{orientation === 'white' ? 'Blancs' : 'Noirs'}</strong>, {speedsLabel(gamesSpeeds)}, {gamesDays ? `${gamesDays} derniers jours` : 'toutes'} (
                  <Link to="/settings">Parties analysées</Link>) — retournez l’échiquier pour vos parties avec les {orientation === 'white' ? 'Noirs' : 'Blancs'}.
                  {mine.data && ply >= mine.data.maxPly && ` Seuls les ${mine.data.maxPly / 2} premiers coups sont indexés.`}
                </p>
              )}
              {mine.isLoading && <p className="muted">Chargement de vos parties…</p>}
              {mine.error && <ErrorText error={mine.error} />}
            </>
          )}
          {data && <MoveTable data={data} inRep={(uci) => prepared.has(uci)} onPick={play} markPopular={markPopular} />}
        </section>

        <details className="panel" open={showGames} onToggle={(e) => setShowGames((e.target as HTMLDetailsElement).open)}>
          <summary>Parties</summary>
          {source === 'lichess' && games.isLoading && <p className="muted">Chargement…</p>}
          {source === 'lichess' && games.error && <ErrorText error={games.error} />}
          {gameList && (
            <>
              {gameList.topGames.length > 0 && <GameList title="Meilleures parties" games={gameList.topGames} onOpen={(id) => loadGame.mutate(id)} />}
              <GameList title={source === 'mine' ? 'Vos dernières parties' : 'Parties récentes'} games={gameList.recentGames} onOpen={(id) => loadGame.mutate(id)} />
            </>
          )}
          {loadGame.isPending && <p className="muted small-text">Chargement de la partie…</p>}
          {loadGame.error && <ErrorText error={loadGame.error} />}
        </details>
      </div>
    </div>
    </>
  );
}

/** Repertoire moves of the position grouped by move: which repertoires play it. */
function groupByMove(rows: RepertoireMoveHere[]) {
  const out = new Map<string, { uci: string; san: string; reps: RepertoireMoveHere[] }>();
  for (const r of rows) {
    const g = out.get(r.uci) ?? { uci: r.uci, san: r.san, reps: [] };
    g.reps.push(r);
    out.set(r.uci, g);
  }
  return out;
}

const RESULT = { white: '1-0', black: '0-1' } as const;

function GameList({ title, games, onOpen }: { title: string; games: (ExplorerGameRef | MyGameRef)[]; onOpen: (id: string) => void }) {
  return (
    <>
      <h4 className="games-title">{title}</h4>
      {games.length === 0 ? (
        <p className="muted small-text">Aucune partie.</p>
      ) : (
        <table className="lines games">
          <tbody>
            {games.map((g) => (
              <tr key={g.id} className="clickable" onClick={() => onOpen(g.id)} title="Rejouer cette partie sur l’échiquier">
                <td>
                  {g.white.name} <span className="muted">{g.white.rating}</span>
                </td>
                <td>
                  {g.black.name} <span className="muted">{g.black.rating}</span>
                </td>
                <td>{g.winner ? RESULT[g.winner] : '½-½'}</td>
                <td className="muted">{[g.speed, g.month].filter(Boolean).join(' · ')}</td>
                <td>
                  <a
                    href={'url' in g ? g.url : `https://lichess.org/${g.id}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={'source' in g && g.source === 'chesscom' ? 'Ouvrir sur Chess.com' : 'Ouvrir sur Lichess'}
                  >
                    ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function ErrorText({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 404) return <p className="muted">Aucune statistique pour cette position.</p>;
  return <p className="error small-text">{error instanceof Error ? error.message : String(error)}</p>;
}
