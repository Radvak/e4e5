import {
  formatScore,
  lichessStudyRef,
  localizePgn,
  moveLabel,
  parseStudy,
  playSanOn,
  positionFromFen,
  START_FEN,
  studyLines,
  studyNodes,
  totalGames,
  type Color,
  type StudyChapter,
  type StudyLine,
  type StudyNode,
} from '@e4e5/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type Me } from '../api';
import { Board } from '../components/Board';
import { San } from '../components/Nag';
import { useEngine } from '../engine/useEngine';
import { fmt, lang, t } from '../i18n';
import { lineText, openingLesson, type Lesson } from '../library/lines';
import { openingBySlug, OPENINGS } from '../library/openings';
import { explorerParams, rangeLabel, useSettings } from '../settings';
import { Button, EmptyState, Icon, PageHeader, Tabs } from '../ui';
import { MiniBoard } from '../components/MiniBoard';

type Side = 'all' | Color;

const SIDE_TABS: { id: Side; label: React.ReactNode }[] = [
  { id: 'all', label: t('Toutes', 'All') },
  { id: 'white', label: <><span className="dot white" /> {t('Blancs', 'White')}</> },
  { id: 'black', label: <><span className="dot black" /> {t('Noirs', 'Black')}</> },
];

const sideLabel = (c: Color) => (c === 'white' ? t('avec les Blancs', 'with White') : t('avec les Noirs', 'with Black'));
const DIFFICULTY = t(['', 'Pour débuter', 'Un peu de théorie', 'Beaucoup de théorie'], ['', 'Beginner friendly', 'Some theory', 'Lots of theory']);

/** The position after the moves that define an opening (its thumbnail). */
function fenAfter(moves: string): string {
  const pos = positionFromFen(START_FEN);
  let fen = START_FEN;
  for (const san of moves.split(/\s+/).filter(Boolean)) fen = playSanOn(pos, san)?.toFen ?? fen;
  return fen;
}

/**
 * Library (/library): well-known openings explained move by move (the app's lessons), and the
 * Lichess studies the user added, read the same way. Each one opens on its page.
 */
export function Library() {
  const [params, setParams] = useSearchParams();
  const side: Side = params.get('side') === 'white' || params.get('side') === 'black' ? (params.get('side') as Color) : 'all';
  const shown = OPENINGS.filter((o) => side === 'all' || o.color === side);
  return (
    <div className="library-page">
      <PageHeader
        title={t('Bibliothèque', 'Library')}
        subtitle={t('Les ouvertures expliquées coup par coup : choisissez-en une pour l’apprendre', 'Openings explained move by move: pick one to learn it')}
      />
      <div className="library-filters">
        <Tabs tabs={SIDE_TABS} value={side} onChange={(s) => setParams(s === 'all' ? {} : { side: s }, { replace: true })} />
      </div>
      <div className="library-grid">
        {shown.map((o) => (
          <Link key={o.slug} to={`/library/${o.slug}`} className="library-card card">
            <MiniBoard fen={fenAfter(o.moves)} orientation={o.color} className="library-thumb" />
            <div className="library-card-text">
              <div className="library-card-title">
                <span className={`dot inline ${o.color}`} /> {t(o.name.fr, o.name.en)}
              </div>
              <div className="muted small-text">{lineText(o.moves)}</div>
              <p className="library-tagline">{t(o.tagline.fr, o.tagline.en)}</p>
              <span className={`badge difficulty-${o.difficulty}`}>{DIFFICULTY[o.difficulty]}</span>
            </div>
          </Link>
        ))}
      </div>
      <MyStudies side={side} />
    </div>
  );
}

/** The Lichess studies added to the library, and the field to add one. */
function MyStudies({ side }: { side: Side }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const studies = useQuery({ queryKey: ['library-studies'], queryFn: api.libraryStudies });
  const [input, setInput] = useState('');
  const ref = lichessStudyRef(input.trim());
  const add = useMutation({
    mutationFn: (id: string) => api.addLibraryStudy(id),
    onSuccess: (s) => {
      setInput('');
      void qc.invalidateQueries({ queryKey: ['library-studies'] });
      qc.setQueryData(['library-study', s.id], s);
      navigate(`/library/study/${s.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteLibraryStudy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-studies'] }),
  });
  const list = (studies.data ?? []).filter((s) => side === 'all' || s.color === side);
  return (
    <section className="library-studies">
      <h3>{t('Vos études Lichess', 'Your Lichess studies')}</h3>
      <p className="muted small-text">
        {t(
          'Ajoutez une étude Lichess pour la lire ici coup par coup, avec ses commentaires, ses flèches et ses variantes.',
          'Add a Lichess study to read it here move by move, with its comments, arrows and variations.',
        )}
      </p>
      <form
        className="library-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (ref && !add.isPending) add.mutate(ref.studyId);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('Lien de l’étude (lichess.org/study/…)', 'Link to the study (lichess.org/study/…)')}
          aria-label={t('Lien d’une étude Lichess', 'Link to a Lichess study')}
        />
        <Button type="submit" variant="primary" icon="plus" disabled={!ref || add.isPending}>
          {add.isPending ? t('Import…', 'Importing…') : t('Ajouter', 'Add')}
        </Button>
      </form>
      {input.trim() && !ref && <p className="muted small-text">{t('Collez le lien d’une étude : lichess.org/study/…', 'Paste the link to a study: lichess.org/study/…')}</p>}
      {add.error && <p className="error small-text">{add.error.message}</p>}
      {list.length > 0 && (
        <ul className="library-study-list">
          {list.map((s) => (
            <li key={s.id}>
              <Link to={`/library/study/${s.id}`} className="library-study-row">
                <span className={`dot inline ${s.color}`} />
                <span className="library-study-name">{s.name}</span>
                <span className="muted small-text">{t(`${s.chapters} chapitre${s.chapters > 1 ? 's' : ''}`, `${s.chapters} chapter${s.chapters > 1 ? 's' : ''}`)}</span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                title={t('Retirer de la bibliothèque', 'Remove from the library')}
                onClick={() => {
                  if (confirm(t(`Retirer « ${s.name} » de la bibliothèque ?`, `Remove “${s.name}” from the library?`))) remove.mutate(s.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LibraryOpeningPage({ me }: { me: Me }) {
  const { slug } = useParams();
  const opening = openingBySlug(slug);
  const lesson = useMemo(() => opening && openingLesson(opening), [opening]);
  if (!lesson) return <NotFound />;
  return <LessonView key={lesson.path} me={me} lesson={lesson} />;
}

export function LibraryStudyPage({ me }: { me: Me }) {
  const { id } = useParams();
  const study = useQuery({ queryKey: ['library-study', id], queryFn: () => api.libraryStudy(id!), enabled: !!id });
  const lesson = useMemo<Lesson | undefined>(
    () =>
      study.data && {
        path: `/library/study/${study.data.id}`,
        color: study.data.color,
        name: study.data.name,
        meta: t('Étude Lichess', 'Lichess study'),
        chapters: study.data.chapters,
        links: [{ label: t('L’étude sur Lichess', 'The study on Lichess'), href: `https://lichess.org/study/${study.data.id}` }],
      },
    [study.data],
  );
  if (study.isLoading) return <PageHeader title={t('Bibliothèque', 'Library')} back="/library" />;
  if (!lesson) return <NotFound />;
  return <LessonView key={lesson.path} me={me} lesson={lesson} />;
}

function NotFound() {
  return (
    <>
      <PageHeader title={t('Bibliothèque', 'Library')} back="/library" />
      <EmptyState title={t('Introuvable', 'Not found')} action={<Button to="/library">{t('Voir la bibliothèque', 'See the library')}</Button>} />
    </>
  );
}

/** The chapter's parent of a node id ("" for the start). */
const parentId = (id: string) => (id.includes(',') ? id.slice(0, id.lastIndexOf(',')) : '');

/** Brushes of the study's arrows (chessground's own colours). */
const toShape = (s: { orig: string; dest?: string; color: string }): DrawShape => ({ orig: s.orig as Key, dest: s.dest as Key | undefined, brush: s.color });
const arrow = (uci: string, brush: string, lineWidth = 10): DrawShape => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush, modifiers: { lineWidth } });

/**
 * A lesson read move by move, like a Lichess study: the board with the arrows of each move, its
 * explanation, the lines with where each variation leaves its line, the other moves possible
 * (players of my level, Stockfish), and a "guess the move" mode.
 */
function LessonView({ me, lesson }: { me: Me; lesson: Lesson }) {
  const [params, setParams] = useSearchParams();
  const chapterIndex = Math.max(0, Math.min(Number(params.get('ch') ?? 0) || 0, lesson.chapters.length - 1));
  const [nodeId, setNodeId] = useState('');
  const chapter: StudyChapter = useMemo(() => parseStudy(lesson.chapters[chapterIndex]!.pgn, lang)[0]!, [lesson, chapterIndex]);
  const nodes = useMemo(() => studyNodes(chapter), [chapter]);
  const lines = useMemo(() => studyLines(chapter), [chapter]);
  useEffect(() => setNodeId(''), [chapter]);
  const node = nodes.get(nodeId);
  const fen = node?.toFen ?? chapter.startFen;
  const children = node ? node.children : chapter.children;
  const orientation: Color = chapter.orientation ?? lesson.color;
  // A study may have chapters for both sides: training is then for the side of the chapter shown.
  const mixed = new Set(lesson.chapters.map((c) => c.orientation ?? lesson.color)).size > 1;
  const pickChapter = (i: number) => setParams(i ? { ch: String(i) } : {}, { replace: true });

  // "Devine le coup": the user plays the lesson's moves of their side, the app the others.
  const [quiz, setQuiz] = useState(false);
  const [misses, setMisses] = useState(0);
  const [feedback, setFeedback] = useState<'ok' | 'miss' | 'off' | null>(null);
  /** The move just found in the quiz: its explanation stays shown while the app replies. */
  const [guessed, setGuessed] = useState<StudyNode | null>(null);
  const toGuess = quiz && children.length > 0 && children[0]!.color === orientation;
  const go = (id: string) => {
    setNodeId(id);
    setMisses(0);
    setFeedback(null);
    setGuessed(null);
  };
  // The opponent's moves are played by the app, along the main line.
  useEffect(() => {
    if (!quiz || toGuess || !children[0]) return;
    const timer = setTimeout(() => setNodeId(children[0]!.id), 700);
    return () => clearTimeout(timer);
  }, [quiz, toGuess, nodeId, chapter]);

  const onMove = (uci: string) => {
    const child = children.find((c) => c.uci === uci);
    if (quiz && toGuess) {
      if (child) {
        go(child.id);
        setFeedback('ok');
        setGuessed(child);
        return;
      }
      setMisses((m) => m + 1);
      setFeedback('miss');
      return false;
    }
    if (child) return go(child.id);
    setFeedback('off');
    return 'retry' as const;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input, select')) return;
      if (e.key === 'ArrowLeft' && nodeId) go(parentId(nodeId));
      if (e.key === 'ArrowRight' && children[0] && !toGuess) go(children[0].id);
      if (e.key === 'Home') go('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Arrows: the study's own for the move, and at a fork every way on (main line green, variations orange).
  const shapes = useMemo<DrawShape[]>(() => {
    if (toGuess) return misses >= 2 ? [arrow(children[0]!.uci, 'nextDraft')] : [];
    const out = (node ? node.shapes : chapter.introShapes).map(toShape);
    if (children.length > 1) children.forEach((c, i) => out.push(arrow(c.uci, i === 0 ? 'next' : 'nextDraft', i === 0 ? 10 : 7)));
    return out;
  }, [node, chapter, children, toGuess, misses]);

  const comment = node ? node.comment : chapter.intro;
  const end = children.length === 0 && !!node;

  return (
    <>
      <PageHeader title={lesson.name} subtitle={[lesson.meta, !mixed && sideLabel(lesson.color)].filter(Boolean).join(' · ')} back="/library" />
      <div className="library-actions">
        {lesson.difficulty && <span className={`badge difficulty-${lesson.difficulty}`}>{DIFFICULTY[lesson.difficulty]}</span>}
        <div className="spacer" />
        <TrainButton lesson={lesson} color={orientation} mixed={mixed} />
      </div>
      {lesson.chapters.length > 1 && (
        <div className="library-chapters" role="tablist">
          {lesson.chapters.map((c, i) => (
            <button key={i} role="tab" aria-selected={i === chapterIndex} className={`chip ${i === chapterIndex ? 'on' : ''}`} onClick={() => pickChapter(i)}>
              {c.name} {c.trap && <span className="badge trap">{t('Piège', 'Trap')}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="editor library-opening">
        <div className="editor-board">
          <div className="board-row">
            <Board fen={fen} orientation={orientation} lastMove={node?.uci} shapes={shapes} onMove={onMove} />
          </div>
          <div className="nav">
            <button onClick={() => go('')} title={t('Début (Origine)', 'Start (Home)')}>⏮</button>
            <button onClick={() => nodeId && go(parentId(nodeId))} title={t('Reculer (←)', 'Back (←)')}>◀</button>
            <button onClick={() => children[0] && !toGuess && go(children[0].id)} disabled={toGuess} title={t('Avancer (→)', 'Forward (→)')}>▶</button>
            <button
              className={`library-quiz-toggle ${quiz ? 'on' : ''}`}
              onClick={() => {
                setQuiz(!quiz);
                setFeedback(null);
                setMisses(0);
              }}
              title={t('Devine le coup : jouez vous-même les coups du cours', 'Guess the move: play the lesson’s moves yourself')}
            >
              <Icon name="target" size={16} /> {t('Devine le coup', 'Guess the move')}
            </button>
          </div>
        </div>

        <div className="editor-side">
          <section className="panel library-comment" aria-live="polite">
            {toGuess ? (
              <>
                <div className="library-comment-move">{t(`À vous : le coup des ${orientation === 'white' ? 'Blancs' : 'Noirs'} ?`, `Your turn: ${orientation === 'white' ? 'White' : 'Black'}’s move?`)}</div>
                {guessed && (
                  <p className="library-prev small-text">
                    <span className="badge library-ok">{t('Bravo', 'Correct')}</span> <strong>{moveLabel(guessed)}</strong> {guessed.comment}
                  </p>
                )}
                {node && node !== guessed && node.comment && (
                  <p className="library-prev muted small-text">
                    <strong>{moveLabel(node)}</strong> {node.comment}
                  </p>
                )}
                {feedback === 'miss' && (
                  <p className="error small-text">
                    {misses >= 2 ? t('Pas encore : la flèche orange montre le coup.', 'Not yet: the orange arrow shows the move.') : t('Ce n’est pas le coup du cours. Réessayez.', 'That’s not the lesson’s move. Try again.')}
                  </p>
                )}
                <button className="link small-text" onClick={() => go(children[0]!.id)}>
                  {t('Voir le coup', 'Show the move')}
                </button>
              </>
            ) : (
              <>
                <div className="library-comment-move">
                  {node ? (
                    <>
                      {feedback === 'ok' && <span className="badge library-ok">{t('Bravo', 'Correct')}</span>} {node.moveNumber}
                      {node.color === 'white' ? '.' : '…'} <San san={node.san} nags={node.nags} />
                    </>
                  ) : (
                    lesson.chapters[chapterIndex]!.name
                  )}
                </div>
                {comment ? <p className="library-note">{comment}</p> : <p className="muted small-text">{node ? t('Pas de commentaire sur ce coup.', 'No comment on this move.') : t('Avancez avec ▶ ou jouez le premier coup sur l’échiquier.', 'Step forward with ▶ or play the first move on the board.')}</p>}
                {feedback === 'off' && <p className="muted small-text">{t('Ce coup n’est pas dans le cours.', 'That move is not in the lesson.')}</p>}
                {end && (
                  <p className="muted small-text">
                    {t('Fin de la ligne. ', 'End of the line. ')}
                    <button className="link" onClick={() => go('')}>{t('Recommencer', 'Start again')}</button>
                  </p>
                )}
                {children.length > 1 && (
                  <p className="small-text library-fork-hint">
                    <span className="badge library-fork">{t('Scission', 'Fork')}</span>{' '}
                    {t('Ici, plusieurs suites : ', 'Several ways on here: ')}
                    {children.map((c, i) => (
                      <Fragment key={c.id}>
                        {i > 0 && ', '}
                        <button className={`link ${i === 0 ? 'library-main-move' : 'library-alt-move'}`} onClick={() => go(c.id)}>
                          {moveLabel(c)}
                        </button>
                        {i === 0 && t(' (ligne principale)', ' (main line)')}
                      </Fragment>
                    ))}
                  </p>
                )}
              </>
            )}
          </section>

          {node && !toGuess && <WhyPanel me={me} node={node} siblings={(nodes.get(parentId(node.id))?.children ?? chapter.children)} onPick={go} />}

          <section className="panel">
            <h3>{t('Les lignes', 'The lines')}</h3>
            <LineTree lines={lines} current={nodeId} onPick={go} />
          </section>

          {(lesson.summary || lesson.ideas?.length) && (
            <section className="panel library-text">
              {lesson.summary && (
                <>
                  <h3>{t('L’ouverture', 'The opening')}</h3>
                  <p>{lesson.summary}</p>
                </>
              )}
              {lesson.ideas && lesson.ideas.length > 0 && (
                <>
                  <h3>{t('Les idées à retenir', 'Key ideas')}</h3>
                  <ul>
                    {lesson.ideas.map((idea, i) => (
                      <li key={i}>{idea}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          {lesson.links && (
            <p className="muted small-text library-sources">
              {t('Pour aller plus loin : ', 'To go further: ')}
              {lesson.links.map((l, i) => (
                <Fragment key={l.href}>
                  {i > 0 && ' · '}
                  <a href={l.href} target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                </Fragment>
              ))}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The lines of the chapter: the main line, then each variation under it, indented, with where it
 * leaves its line ("au coup 4 · au lieu de 4… Bd6"): the moves shared with that line greyed (the
 * last two only), the move that differs highlighted.
 */
function LineTree({ lines, current, onPick }: { lines: StudyLine[]; current: string; onPick: (id: string) => void }) {
  if (lines.length === 0) return <p className="muted small-text">{t('Ce chapitre n’a pas de coups.', 'This chapter has no moves.')}</p>;
  const onPath = (n: StudyNode) => current === n.id || current.startsWith(`${n.id},`);
  const moveButton = (n: StudyNode, i: number, line: StudyLine, cls = '') => (
    <button
      key={n.id}
      className={['link', 'library-move', cls, n.id === current ? 'current' : onPath(n) ? 'on-path' : ''].filter(Boolean).join(' ')}
      onClick={() => onPick(n.id)}
    >
      {n.color === 'white' || i === line.fork ? `${n.moveNumber}${n.color === 'white' ? '.' : '…'} ` : ''}
      <San san={n.san} nags={n.nags} />
    </button>
  );
  return (
    <div className="library-tree">
      {lines.map((line, li) => {
        if (line.depth === 0) return <div key={li} className="library-mainline">{line.nodes.map((n, i) => moveButton(n, i, line))}</div>;
        const shared = line.nodes.slice(0, line.fork);
        const firstShown = Math.max(0, line.fork - 2);
        const fork = line.nodes[line.fork]!;
        return (
          <div key={li} className="library-variation" style={{ marginLeft: `${Math.min(line.depth - 1, 3) * 14}px` }}>
            <div className="library-variation-head small-text">
              <span className="badge library-fork">{t(`Scission au coup ${fork.moveNumber}`, `Fork at move ${fork.moveNumber}`)}</span>{' '}
              {line.instead && (
                <span className="muted">
                  {t('au lieu de ', 'instead of ')}
                  <button className="link library-main-move" onClick={() => onPick(line.instead!.id)}>
                    {moveLabel(line.instead)}
                  </button>
                </span>
              )}
            </div>
            <div className="library-variation-moves">
              {firstShown > 0 && <span className="muted">… </span>}
              {shared.slice(firstShown).map((n, k) => moveButton(n, firstShown + k, line, 'shared'))}
              {moveButton(fork, line.fork, line, 'library-alt-move')}
              {line.nodes.slice(line.fork + 1).map((n, k) => moveButton(n, line.fork + 1 + k, line))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Score of a move for the side that plays it (wins + half the draws), from Lichess counts. */
const scoreFor = (m: { white: number; draws: number; black: number }, color: Color) => {
  const n = totalGames(m);
  return n ? ((color === 'white' ? m.white : m.black) + m.draws / 2) / n : 0;
};

/**
 * "Pourquoi ce coup ?": the moves possible where the lesson's move was played, side by side: how
 * often players of my level play each and how it scores for them (Lichess), and Stockfish's
 * evaluation, the lesson's move and its variations marked.
 */
function WhyPanel({ me, node, siblings, onPick }: { me: Me; node: StudyNode; siblings: StudyNode[]; onPick: (id: string) => void }) {
  const { speed, range } = useSettings();
  const ex = explorerParams(me, speed, range);
  const stats = useQuery({
    queryKey: ['explorer', node.fromFen, ex.speeds, ex.ratings],
    queryFn: () => api.explorer(node.fromFen, ex.speeds, ex.ratings),
    staleTime: Infinity,
    retry: false,
  });
  const [engineOn, setEngineOn] = useState(false);
  const engine = useEngine(node.fromFen, engineOn, 4);
  const data = stats.data?.data;
  const total = data ? totalGames(data) : 0;
  const rows = useMemo(() => {
    const byUci = new Map<string, { uci: string; san: string; share?: number; score?: number; eval?: string; inLesson?: StudyNode }>();
    const row = (uci: string, san: string) => byUci.get(uci) ?? byUci.set(uci, { uci, san }).get(uci)!;
    for (const s of siblings) row(s.uci, s.san).inLesson = s;
    for (const m of (data?.moves ?? []).slice(0, 5)) {
      const r = row(m.uci, m.san);
      r.share = total ? totalGames(m) / total : 0;
      r.score = scoreFor(m, node.color);
    }
    for (const l of engine.lines) {
      const first = l?.pv[0];
      if (!first) continue;
      const r = row(first.uci, first.san);
      // From the mover's side.
      const score = node.color === 'white' ? l.score : 'cp' in l.score ? { cp: -l.score.cp } : { mate: -l.score.mate };
      r.eval = formatScore(score);
    }
    const all = [...byUci.values()];
    return [...all.filter((r) => r.uci === node.uci), ...all.filter((r) => r.uci !== node.uci).sort((a, b) => (b.share ?? -1) - (a.share ?? -1))];
  }, [siblings, data, total, engine.lines, node]);
  const pct = (x: number) => t(`${fmt(Math.round(100 * x))} %`, `${fmt(Math.round(100 * x))}%`);
  return (
    <section className="panel library-why">
      <h3>
        {t('Pourquoi ce coup ?', 'Why this move?')} <span className="muted small-text">· {t('les autres choix possibles à ce moment', 'the other choices at that moment')}</span>
      </h3>
      <table className="library-why-table">
        <thead>
          <tr>
            <th>{t('Coup', 'Move')}</th>
            <th title={t(`Joueurs Lichess ${rangeLabel(ex.ratings)}`, `Lichess players ${rangeLabel(ex.ratings)}`)}>{t('Joué', 'Played')}</th>
            <th title={t('Score pour le camp qui joue (victoires + moitié des nulles)', 'Score for the side that plays it (wins + half the draws)')}>{t('Score', 'Score')}</th>
            <th title={t('Évaluation pour le camp qui joue : plus elle est haute, mieux c’est', 'Evaluation for the side that plays it: the higher, the better')}>{t('Stockfish', 'Stockfish')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.uci}
              className={[r.uci === node.uci ? 'lesson-move' : '', r.inLesson ? 'clickable' : ''].filter(Boolean).join(' ')}
              onClick={() => r.inLesson && onPick(r.inLesson.id)}
            >
              <td>
                <San san={r.san} />{' '}
                {r.uci === node.uci ? (
                  <span className="badge library-ok">{t('le coup du cours', 'the lesson’s move')}</span>
                ) : r.inLesson ? (
                  <span className="badge library-fork">{t('variante', 'variation')}</span>
                ) : null}
              </td>
              <td>{r.share !== undefined ? pct(r.share) : '–'}</td>
              <td>{r.score !== undefined ? pct(r.score) : '–'}</td>
              <td>{r.eval ?? (engineOn ? '…' : '–')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small-text">
        {stats.isLoading
          ? t('Chargement des statistiques…', 'Loading the statistics…')
          : !data
            ? t('Pas de statistiques à votre niveau ici (Paramètres › Mode local pour les télécharger).', 'No statistics at your level here (Settings › Local mode to download them).')
            : t(`Joueurs Lichess ${rangeLabel(ex.ratings)}.`, `Lichess players ${rangeLabel(ex.ratings)}.`)}{' '}
        <button className="link" onClick={() => setEngineOn(!engineOn)}>
          {engineOn ? t('Arrêter Stockfish', 'Stop Stockfish') : t('Évaluer avec Stockfish', 'Evaluate with Stockfish')}
        </button>
      </p>
    </section>
  );
}

/**
 * "S'entraîner sur cette ouverture": makes a repertoire of the lesson (one chapter per chapter
 * with moves, traps left out, the comments in the interface's language), then opens its
 * training. Once made, it opens that repertoire's training.
 */
function TrainButton({ lesson, color, mixed }: { lesson: Lesson; color: Color; mixed: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  // A study for both sides: one repertoire per side, named after it.
  const name = mixed ? `${lesson.name} (${color === 'white' ? t('Blancs', 'White') : t('Noirs', 'Black')})` : lesson.name;
  const existing = reps.data?.find((r) => r.name === name && r.color === color);
  const chapters = useMemo(
    () =>
      lesson.chapters
        .filter((c) => !c.trap && (c.orientation ?? lesson.color) === color && parseStudy(c.pgn)[0]!.children.length > 0)
        .map((c) => ({ name: c.name, pgn: localizePgn(c.pgn, lang) })),
    [lesson, color],
  );
  const create = useMutation({
    mutationFn: () => api.createRepertoire(name, color, { chapters }),
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
  if (chapters.length === 0) return null;
  return (
    <>
      {create.error && <span className="error small-text">{create.error.message}</span>}
      <Button
        variant="primary"
        icon="target"
        disabled={create.isPending || reps.isLoading}
        onClick={() => create.mutate()}
        title={t(
          `Crée le répertoire « ${name} » (${chapters.length} chapitre${chapters.length > 1 ? 's' : ''}) et lance l’entraînement`,
          `Creates the “${name}” repertoire (${chapters.length} chapter${chapters.length > 1 ? 's' : ''}) and starts training`,
        )}
      >
        {mixed
          ? t(`S’entraîner (chapitres ${color === 'white' ? 'Blancs' : 'Noirs'})`, `Train (${color === 'white' ? 'White' : 'Black'} chapters)`)
          : t('S’entraîner sur cette ouverture', 'Train on this opening')}
      </Button>
    </>
  );
}
