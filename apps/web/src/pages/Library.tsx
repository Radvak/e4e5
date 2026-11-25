import { playUci, START_FEN, type Color, type PlayedMove } from '@e4e5/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type Me } from '../api';
import { LEVEL_STEPS, topLevelMove, useBestMoves, useLevelDepth } from '../components/BestMoves';
import { Board } from '../components/Board';
import { ExplorerPanel } from '../components/ExplorerPanel';
import { MiniBoard } from '../components/MiniBoard';
import { San } from '../components/Nag';
import { t } from '../i18n';
import { linePgn, lineText, playLine, tx, type LibraryLine, type LibraryOpening } from '../library/lines';
import { openingBySlug, OPENINGS } from '../library/openings';
import { explorerParams, rangeLabel, useSettings } from '../settings';
import { Button, EmptyState, PageHeader, Tabs } from '../ui';

type Side = 'all' | Color;

const SIDE_TABS: { id: Side; label: React.ReactNode }[] = [
  { id: 'all', label: t('Toutes', 'All') },
  { id: 'white', label: <><span className="dot white" /> {t('Blancs', 'White')}</> },
  { id: 'black', label: <><span className="dot black" /> {t('Noirs', 'Black')}</> },
];

const sideLabel = (c: Color) => (c === 'white' ? t('avec les Blancs', 'with White') : t('avec les Noirs', 'with Black'));
const DIFFICULTY = t(['', 'Pour débuter', 'Un peu de théorie', 'Beaucoup de théorie'], ['', 'Beginner friendly', 'Some theory', 'Lots of theory']);

/** The position after the moves that define the opening (its thumbnail). */
const openingFen = (o: LibraryOpening) => playLine(o.moves)?.at(-1)?.toFen ?? START_FEN;

/**
 * Library (/library): famous openings explained, to pick one and learn it. Each opening has its
 * page (/library/:slug) with its ideas, its main lines on the board, the moves played at my level,
 * and a button that makes a repertoire of it and starts training.
 */
export function Library() {
  const [params, setParams] = useSearchParams();
  const side: Side = params.get('side') === 'white' || params.get('side') === 'black' ? (params.get('side') as Color) : 'all';
  const shown = OPENINGS.filter((o) => side === 'all' || o.color === side);
  return (
    <div className="library-page">
      <PageHeader
        title={t('Bibliothèque', 'Library')}
        subtitle={t('Les ouvertures les plus connues, expliquées : choisissez-en une pour l’apprendre', 'The best-known openings, explained: pick one to learn it')}
      />
      <div className="library-filters">
        <Tabs tabs={SIDE_TABS} value={side} onChange={(s) => setParams(s === 'all' ? {} : { side: s }, { replace: true })} />
      </div>
      <div className="library-grid">
        {shown.map((o) => (
          <Link key={o.slug} to={`/library/${o.slug}`} className="library-card card">
            <MiniBoard fen={openingFen(o)} orientation={o.color} className="library-thumb" />
            <div className="library-card-text">
              <div className="library-card-title">
                <span className={`dot inline ${o.color}`} /> {tx(o.name)}
              </div>
              <div className="muted small-text">{lineText(o.moves)}</div>
              <p className="library-tagline">{tx(o.tagline)}</p>
              <span className={`badge difficulty-${o.difficulty}`}>{DIFFICULTY[o.difficulty]}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The lines of the opening that make its repertoire (traps are only explained). */
const trainedLines = (o: LibraryOpening) => o.lines.filter((l) => !l.trap);

export function LibraryOpeningPage({ me }: { me: Me }) {
  const { slug } = useParams();
  const opening = openingBySlug(slug);
  if (!opening) {
    return (
      <>
        <PageHeader title={t('Bibliothèque', 'Library')} back="/library" />
        <EmptyState title={t('Ouverture introuvable', 'Opening not found')} action={<Button to="/library">{t('Voir toutes les ouvertures', 'See all openings')}</Button>} />
      </>
    );
  }
  return <OpeningView key={opening.slug} me={me} opening={opening} />;
}

function OpeningView({ me, opening }: { me: Me; opening: LibraryOpening }) {
  const [lineIndex, setLineIndex] = useState(0);
  const libLine: LibraryLine = opening.lines[lineIndex]!;
  const libMoves = useMemo(() => playLine(libLine.moves) ?? [], [libLine]);
  // The line on the board: the opening's line, or a variation the user played from it.
  const [line, setLine] = useState<PlayedMove[]>(libMoves);
  const [ply, setPly] = useState(0);
  useEffect(() => {
    setLine(libMoves);
    setPly(0);
  }, [libMoves]);
  const goTo = (n: number) => setPly(Math.max(0, Math.min(n, line.length)));
  const fen = line[ply - 1]?.toFen ?? START_FEN;
  // Where the board's line leaves the opening's line (-1: it follows it).
  const leaves = line.findIndex((m, i) => libMoves[i]?.uci !== m.uci);
  const offLine = leaves !== -1;
  /** Plays a move: follows the line if it is its next move, else branches off. */
  const play = (uci: string) => {
    if (line[ply]?.uci === uci) return goTo(ply + 1);
    const move = playUci(fen, uci);
    if (move) {
      setLine([...line.slice(0, ply), move]);
      setPly(ply + 1);
    }
  };
  const playMoves = (moves: PlayedMove[]) => {
    const follows = moves.every((m, i) => line[ply + i]?.uci === m.uci);
    if (follows) return goTo(ply + moves.length);
    setLine([...line.slice(0, ply), ...moves]);
    setPly(ply + moves.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input, select')) return;
      if (e.key === 'ArrowLeft') goTo(ply - 1);
      if (e.key === 'ArrowRight') goTo(ply + 1);
      if (e.key === 'Home') goTo(0);
      if (e.key === 'End') goTo(line.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Moves played at my level here (Lichess statistics), and the search at my level, as in Explorer.
  const { speed, range } = useSettings();
  const ex = explorerParams(me, speed, range);
  const stats = useQuery({
    queryKey: ['explorer', fen, ex.speeds, ex.ratings],
    queryFn: () => api.explorer(fen, ex.speeds, ex.ratings),
    staleTime: Infinity,
    retry: false,
  });
  const [depth, onDepth] = useLevelDepth();
  const toMove: Color = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const myTurn = toMove === opening.color;
  const level = useBestMoves(fen, ex.speeds, ex.ratings, depth > 0, depth, opening.color);
  const levelBest = depth > 0 && myTurn ? topLevelMove(level.data) : undefined;
  // The next move of the opening's line (green arrow), and the best move at my level (as in Explorer).
  const nextInLine = !offLine || ply < leaves ? libMoves[ply] : undefined;
  const shapes = useMemo<DrawShape[]>(() => {
    const arrow = (uci: string, brush: string, lineWidth: number): DrawShape => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush, modifiers: { lineWidth } });
    const out: DrawShape[] = [];
    if (nextInLine) out.push(arrow(nextInLine.uci, 'repertoire', 9));
    if (levelBest && levelBest.uci !== nextInLine?.uci) out.push(arrow(levelBest.uci, 'level', 6));
    return out;
  }, [nextInLine?.uci, levelBest?.uci]);

  const note = ply > 0 && (!offLine || ply <= leaves) ? libLine.notes?.[ply] : undefined;

  return (
    <>
      <PageHeader title={tx(opening.name)} subtitle={`${opening.eco} · ${sideLabel(opening.color)}`} back="/library" />
      {/* Under the title, not in it: on a phone the buttons would squeeze the name. */}
      <div className="library-actions">
        <span className={`badge difficulty-${opening.difficulty}`}>{DIFFICULTY[opening.difficulty]}</span>
        <div className="spacer" />
        <TrainButton opening={opening} />
      </div>
      <div className="editor library-opening">
        <div className="editor-board">
          <div className="opening-name">{tx(libLine.name)}</div>
          <div className="board-row">
            <Board fen={fen} orientation={opening.color} lastMove={line[ply - 1]?.uci} shapes={shapes} onMove={play} />
          </div>
          <div className="nav">
            <button onClick={() => goTo(0)} title={t('Début (Origine)', 'Start (Home)')}>⏮</button>
            <button onClick={() => goTo(ply - 1)} title={t('Reculer (←)', 'Back (←)')}>◀</button>
            <button onClick={() => goTo(ply + 1)} title={t('Avancer (→)', 'Forward (→)')}>▶</button>
            <button onClick={() => goTo(line.length)} title={t('Fin de la ligne (Fin)', 'End of the line (End)')}>⏭</button>
          </div>
          <section className="library-level">
            <h3>
              {t('À votre niveau', 'At your level')} <span className="muted small-text">· {t(`joueurs Lichess ${rangeLabel(ex.ratings)}`, `Lichess players ${rangeLabel(ex.ratings)}`)}</span>
            </h3>
            <ExplorerPanel
              fen={fen}
              color={opening.color}
              inRep={(uci) => uci === nextInLine?.uci}
              stats={stats.data}
              error={stats.error}
              loading={stats.isLoading}
              onPick={play}
              firstMoveNumber={ply}
              onPlay={playMoves}
              level={{
                data: level.data,
                loading: level.isLoading,
                error: level.error,
                depth,
                maxDepth: LEVEL_STEPS,
                onDepth,
                myTurn,
                range: rangeLabel(ex.ratings),
              }}
            />
          </section>
        </div>

        <div className="editor-side">
          <section className="panel library-line">
            <div className="moves-path">
              {line.map((m, i) => (
                <button key={i} className={['link', i === ply - 1 ? 'current' : '', i >= ply ? 'ahead' : ''].filter(Boolean).join(' ')} onClick={() => goTo(i + 1)}>
                  {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                  <San san={m.san} />
                </button>
              ))}
            </div>
            {note && <p className="library-note">{tx(note)}</p>}
            {offLine && (
              <p className="muted small-text">
                {t('Vous avez quitté la ligne. ', 'You left the line. ')}
                <button className="link" onClick={() => { setLine(libMoves); setPly(Math.min(ply, leaves)); }}>
                  {t('Revenir à la ligne', 'Back to the line')}
                </button>
              </p>
            )}
          </section>

          <section className="panel">
            <h3>{t('Les lignes', 'The lines')}</h3>
            <ul className="library-lines">
              {opening.lines.map((l, i) => (
                <li key={i}>
                  <button className={`library-line-pick ${i === lineIndex ? 'on' : ''}`} onClick={() => setLineIndex(i)}>
                    <span className="library-line-name">
                      {tx(l.name)} {l.trap && <span className="badge trap">{t('Piège', 'Trap')}</span>}
                    </span>
                    <span className="muted small-text">{lineText(l.moves)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel library-text">
            <h3>{t('L’ouverture', 'The opening')}</h3>
            <p>{tx(opening.summary)}</p>
            <h3>{t('Les idées à retenir', 'Key ideas')}</h3>
            <ul>
              {opening.ideas.map((idea, i) => (
                <li key={i}>{tx(idea)}</li>
              ))}
            </ul>
            <p className="muted small-text library-sources">
              {t('Pour aller plus loin : ', 'To go further: ')}
              <a href={`https://lichess.org/opening/${opening.lichess}`} target="_blank" rel="noreferrer">Lichess</a>
              {' · '}
              <a href={tx(opening.wikipedia)} target="_blank" rel="noreferrer">Wikipedia</a>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * "S'entraîner sur cette ouverture": makes a repertoire of the opening (one chapter per line, the
 * notes as comments), then opens its training. Once made, it opens that repertoire's training.
 */
function TrainButton({ opening }: { opening: LibraryOpening }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const name = tx(opening.name);
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const existing = reps.data?.find((r) => r.name === name && r.color === opening.color);
  const create = useMutation({
    mutationFn: () =>
      api.createRepertoire(name, opening.color, {
        chapters: trainedLines(opening).map((l) => ({ name: tx(l.name), pgn: linePgn(l) })),
      }),
    onSuccess: (rep) => {
      // Straight to the training; the lists catch up in the background (the gaps take a while).
      void qc.invalidateQueries({ queryKey: ['repertoires'] });
      void qc.invalidateQueries({ queryKey: ['training-summary'] });
      void qc.invalidateQueries({ queryKey: ['gaps'] });
      navigate(`/r/${rep.id}/train`);
    },
  });
  if (existing) {
    return (
      <>
        <Button to={`/r/${existing.id}`} title={t('Ouvrir le répertoire de cette ouverture', 'Open this opening’s repertoire')}>
          {t('Répertoire', 'Repertoire')}
        </Button>
        <Button variant="primary" icon="target" to={`/r/${existing.id}/train`}>
          {t('S’entraîner', 'Train')}
        </Button>
      </>
    );
  }
  return (
    <>
      {create.error && <span className="error small-text">{create.error.message}</span>}
      <Button
        variant="primary"
        icon="target"
        disabled={create.isPending || reps.isLoading}
        onClick={() => create.mutate()}
        title={t(
          `Crée le répertoire « ${name} » (${trainedLines(opening).length} lignes) et lance l’entraînement`,
          `Creates the “${name}” repertoire (${trainedLines(opening).length} lines) and starts training`,
        )}
      >
        {t('S’entraîner sur cette ouverture', 'Train on this opening')}
      </Button>
    </>
  );
}
