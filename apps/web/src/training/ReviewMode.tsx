import { lineStarts, pickNewLines, START_FEN, type RepMove, type TrainingPosition } from '@prepa-cahier/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Grade, ReviewCard } from '../api';
import { Board } from '../components/Board';
import { dayStart } from '../settings';
import { answerArrows, inTime, JUMP_MS, lineText, OpponentComment, REPLAY_MS, REPLAYED_PLIES, REPLY_MS } from './common';
import { FeedbackPanel, outcomeOf, type Feedback, type Outcome } from './Feedback';
import type { Source } from './useTrainingSources';

interface Item {
  source: Source;
  target: TrainingPosition;
}

interface Question extends Item {
  isNew: boolean;
  /** When the line continues: my last move, then the opponent's reply leading to `target`. */
  lead?: { mine: RepMove; reply: RepMove };
}

const same = (a: Item, b: Item) => a.source.id === b.source.id && a.target.fen === b.target.fen;

/**
 * Spaced-repetition review: positions due first (oldest first), then new ones, following the
 * line when the opponent's reply leads to another position waiting to be asked. On demand,
 * "review ahead" continues with learnt positions that are not due yet (soonest first).
 */
export function ReviewMode({
  sources,
  newPerDay,
  onReview,
  onCounts,
  idle,
  onTest,
  reachOf,
  noNewLimit = false,
}: {
  sources: Source[];
  newPerDay: number;
  /** All unseen positions are available (e.g. training a chosen subtree). */
  noNewLimit?: boolean;
  onReview: (source: Source, fen: string, grade: Grade) => void;
  onCounts: (c: { dueLines: number; freshLines: number; reviewed: number; asked: number; firstTry: number }) => void;
  /** Shown when nothing is left to review. */
  idle: React.ReactNode;
  /** Switch to "Se tester" (offered when the review is done). */
  onTest?: () => void;
  /**
   * Probability of reaching a position at the user's level: when given, new positions are
   * learnt most likely first (a position always comes after the one leading to it, since the
   * probability decreases along a line); unknown ones come last, in the repertoire's order.
   */
  reachOf?: (source: Source, fen: string) => number | undefined;
}) {
  const [extraNew, setExtraNew] = useState(0);
  const [ahead, setAhead] = useState(false);
  /** Positions answered in this session (not asked again when reviewing ahead). */
  const answered = useRef(new Set<string>());
  /** reviewed: all answers; asked: positions already learnt; firstTry: asked and right first time. */
  const [stats, setStats] = useState({ reviewed: 0, asked: 0, firstTry: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState<Question | null>(null);
  const [round, setRound] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Learning steps are minutes long: re-check what is due regularly.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      clearInterval(t);
      clearTimeout(jumpTimer.current);
    };
  }, []);

  const queue = useMemo(() => {
    const today0 = dayStart();
    const due: (Item & { at: number })[] = [];
    const fresh: Item[] = [];
    const upcoming: (Item & { at: number })[] = [];
    let unseenLines = 0;
    let freshLines = 0;
    const reach = (item: Item) => reachOf?.(item.source, item.target.fen) ?? -1;
    // Everything in lines (a review always goes through a whole line): new positions are picked
    // by whole lines, up to "new lines per day" minus the lines learnt today.
    for (const source of sources) {
      const today = new Set(source.cardList.filter((c) => Date.parse(c.createdAt) >= today0).map((c) => c.fen));
      const learntTodayLines = lineStarts(source.positions.filter((p) => today.has(p.fen)), (f) => today.has(f)).length;
      const allowed = noNewLimit ? Infinity : Math.max(0, newPerDay + extraNew - learntTodayLines);
      const unseenHere: Item[] = [];
      for (const target of source.positions) {
        const card: ReviewCard | undefined = source.cards.get(target.fen);
        if (!card) unseenHere.push({ source, target });
        else if (Date.parse(card.due) <= now) due.push({ source, target, at: Date.parse(card.due) });
        else upcoming.push({ source, target, at: Date.parse(card.due) });
      }
      // Most likely first (stable sort: the repertoire's order for equal or unknown ones).
      if (reachOf) unseenHere.sort((a, b) => reach(b) - reach(a));
      const picked = pickNewLines(unseenHere.map((i) => ({ ...i, fen: i.target.fen, path: i.target.path })), allowed);
      unseenLines += lineStarts(unseenHere.map((i) => ({ fen: i.target.fen, path: i.target.path })), () => true).length - picked.lines;
      freshLines += picked.lines;
      fresh.push(...picked.chosen.map(({ source, target }) => ({ source, target })));
    }
    if (reachOf) fresh.sort((a, b) => reach(b) - reach(a));
    due.sort((a, b) => a.at - b.at);
    upcoming.sort((a, b) => a.at - b.at);
    const nextDue = upcoming[0] ? new Date(upcoming[0].at) : undefined;
    const early = upcoming.filter((p) => !answered.current.has(`${p.source.id}|${p.target.fen}`));
    const items: Item[] = [...due, ...fresh, ...(ahead ? early : [])];
    // To review: the lines formed by the due positions (per repertoire). New: the lines picked.
    const dueLines = sources.reduce((n, source) => {
      const set = new Set(due.filter((i) => i.source === source).map((i) => i.target.fen));
      return n + lineStarts(source.positions.filter((p) => set.has(p.fen)), (f) => set.has(f)).length;
    }, 0);
    return { due, fresh, items, unseenLines, nextDue, early: early.length, dueLines, freshLines };
  }, [sources, now, newPerDay, extraNew, noNewLimit, ahead, reachOf]);

  useEffect(() => {
    onCounts({ dueLines: queue.dueLines, freshLines: queue.freshLines, ...stats });
  }, [queue.dueLines, queue.freshLines, stats, onCounts]);

  const ask = (q: Question | null) => {
    setCurrent(q);
    setRound((r) => r + 1);
  };
  const question = (item: Item, lead?: Question['lead']): Question => ({
    ...item,
    isNew: !item.source.cards.has(item.target.fen),
    lead,
  });

  // First question, and questions becoming due while idle.
  useEffect(() => {
    if (!current && queue.items[0] && !jumpTimer.current) ask(question(queue.items[0]));
  }, [current, queue.items]);

  /** Next question after answering: follow the line if possible. */
  const nextAfter = (answered: Item, played: RepMove): Question | null => {
    const items = queue.items.filter((p) => !same(p, answered));
    const replies = new Map(answered.source.rep.movesAt(played.toFen).map((m) => [m.toFen, m]));
    const follow = items.find((p) => p.source.id === answered.source.id && replies.has(p.target.fen));
    if (follow) return question(follow, { mine: played, reply: replies.get(follow.target.fen)! });
    return items[0] ? question(items[0]) : null;
  };

  const onAnswered = (q: Question, played: RepMove, outcome: Outcome) => {
    const grade: Grade = outcome === 'correct' ? 'good' : 'again';
    answered.current.add(`${q.source.id}|${q.target.fen}`);
    onReview(q.source, q.target.fen, grade);
    setStats((s) => ({
      reviewed: s.reviewed + 1,
      asked: s.asked + (outcome === 'new' ? 0 : 1),
      firstTry: s.firstTry + (outcome === 'correct' ? 1 : 0),
    }));
    setFeedback({ played, others: q.source.rep.movesAt(q.target.fen).filter((m) => m.uci !== played.uci), outcome });
    const next = nextAfter(q, played);
    if (next?.lead) return ask(next);
    jumpTimer.current = setTimeout(() => {
      jumpTimer.current = undefined;
      setNow(Date.now());
      ask(next);
    }, JUMP_MS);
  };

  if (!current) {
    return (
      <div className="panel done">
        <h3>{sources.every((s) => s.positions.length === 0) ? 'Rien à entraîner ici' : 'Tout est fait pour l’instant 🎉'}</h3>
        {sources.every((s) => s.positions.length === 0) && (
          <p className="muted">Aucune position où c’est à vous de jouer dans ces lignes : ajoutez (et enregistrez) d’abord des coups pour votre camp.</p>
        )}
        {queue.nextDue && <p>Prochaine révision {inTime(queue.nextDue)}.</p>}
        <div className="row">
          {queue.unseenLines > 0 && (
            <button className="primary" onClick={() => setExtraNew((n) => n + 3)}>
              Apprendre {Math.min(3, queue.unseenLines)} nouvelles lignes ({queue.unseenLines} pas encore apprises)
            </button>
          )}
          {queue.early > 0 && (
            <button
              onClick={() => {
                setAhead(true);
                setNow(Date.now());
              }}
            >
              Réviser en avance
            </button>
          )}
          {onTest && sources.some((s) => s.positions.length > 0) && (
            <button className={queue.unseenLines > 0 ? '' : 'primary'} onClick={onTest} title="L’adversaire joue les coups les plus fréquents à votre niveau">
              Se tester
            </button>
          )}
        </div>
        {idle}
      </div>
    );
  }

  return (
    <Drill
      round={round}
      question={current}
      feedback={feedback}
      showName={sources.length > 1}
      onAnswered={(played, outcome) => onAnswered(current, played, outcome)}
    />
  );
}

/**
 * One question. When the line continues, the board first shows my previous move, then plays
 * the opponent's reply. New positions show the answer; two wrong tries reveal it.
 */
function Drill({
  round,
  question,
  feedback,
  showName,
  onAnswered,
}: {
  /** Changes with each question. Not used as a React key: the board must stay mounted. */
  round: number;
  question: Question;
  feedback: Feedback | null;
  showName: boolean;
  onAnswered: (played: RepMove, outcome: Outcome) => void;
}) {
  const { source, target, isNew, lead } = question;
  const plies = target.path.length;
  const fresh = () => ({
    round,
    replied: !lead,
    // Jump to another line: replay its last moves; following the line: no replay.
    shown: lead ? plies : Math.max(0, plies - REPLAYED_PLIES),
    mistakes: 0,
    revealed: isNew,
    played: null as RepMove | null,
    /** Position looked at while navigating back in the line (plies from the start), null: the question. */
    view: null as number | null,
  });
  const [state, setState] = useState(fresh);
  // New question: reset the state during render (keeps the board mounted, no flash).
  const current = state.round === round ? state : fresh();
  if (state.round !== round) setState(current);
  const { replied, shown, mistakes, revealed, played, view } = current;
  const update = (patch: Partial<typeof current>) => setState((s) => ({ ...s, ...patch }));
  const [resetKey, setResetKey] = useState(0);
  const answers = source.rep.movesAt(target.fen);

  useEffect(() => {
    if (replied) return;
    const t = setTimeout(() => update({ replied: true }), REPLY_MS);
    return () => clearTimeout(t);
  }, [replied, round]);

  useEffect(() => {
    if (shown >= plies) return;
    const t = setTimeout(() => update({ shown: shown + 1 }), REPLAY_MS);
    return () => clearTimeout(t);
  }, [shown, plies, round]);

  const ready = replied && shown >= plies && !played;
  /** Answering only from the question position (not while looking back in the line). */
  const asking = ready && view === null;
  /** Navigation in the line, once it has been replayed: 0 = start, plies = the question. */
  const goTo = (n: number) => update({ view: n >= plies ? null : Math.max(0, n) });
  const at = view ?? plies;

  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input, select')) return;
      if (e.key === 'ArrowLeft') goTo(at - 1);
      else if (e.key === 'ArrowRight') goTo(at + 1);
      else if (e.key === 'Home') goTo(0);
      else if (e.key === 'End') goTo(plies);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const play = (uci: string) => {
    if (!asking) return;
    const answer = answers.find((m) => m.uci === uci);
    if (!answer) {
      update({ mistakes: mistakes + 1, revealed: revealed || mistakes + 1 >= 2 });
      setResetKey((k) => k + 1);
      return;
    }
    update({ played: answer });
    // New or helped: asked again soon. Right first time: good.
    onAnswered(answer, outcomeOf(isNew, mistakes, revealed));
  };

  let boardFen: string;
  let lastMove: string | undefined;
  if (played) [boardFen, lastMove] = [played.toFen, played.uci];
  else if (ready && view !== null) [boardFen, lastMove] = [target.path[view - 1]?.toFen ?? START_FEN, target.path[view - 1]?.uci];
  else if (!replied && lead) [boardFen, lastMove] = [lead.mine.toFen, lead.mine.uci];
  else if (shown < plies) [boardFen, lastMove] = [target.path[shown - 1]?.toFen ?? START_FEN, target.path[shown - 1]?.uci];
  else [boardFen, lastMove] = [target.fen, (lead?.reply ?? target.path.at(-1))?.uci];

  const shapes = useMemo(() => (revealed && asking ? answerArrows(answers) : []), [revealed, asking, answers]);

  return (
    <div className="editor">
      <div className="editor-board">
        <Board
          fen={boardFen || START_FEN}
          orientation={source.color}
          lastMove={lastMove}
          shapes={shapes}
          onMove={asking ? play : undefined}
          resetKey={resetKey}
        />
        {plies > 0 && (
          <div className="nav">
            <button onClick={() => goTo(0)} disabled={!ready || at === 0} title="Début de la ligne (Origine)">⏮</button>
            <button onClick={() => goTo(at - 1)} disabled={!ready || at === 0} title="Coup précédent (←)">◀</button>
            <button onClick={() => goTo(at + 1)} disabled={!ready || view === null} title="Coup suivant (→)">▶</button>
            <button onClick={() => goTo(plies)} disabled={!ready || view === null} title="Revenir à la question (Fin)">⏭</button>
          </div>
        )}
      </div>
      <div className="editor-side">
        <section className="panel">
          {showName && <p className="muted small-text">{source.name}</p>}
          {ready && plies > 0 ? (
            <div className="moves-path">
              {target.path.map((m, i) => (
                <button key={i} className={`link ${i === at - 1 ? 'current' : ''}`} onClick={() => goTo(i + 1)}>
                  {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{m.san}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">{lineText(target.path.slice(0, shown)) || 'Position initiale'}</p>
          )}
          {view !== null && (
            <p className="muted small-text">
              Vous regardez la ligne : <button className="link" onClick={() => goTo(plies)}>revenir à la question</button> pour répondre.
            </p>
          )}
          {replied && shown >= plies && <OpponentComment move={lead?.reply ?? target.path.at(-1)} />}
          {played ? (
            <p className="success">✓ {played.san}</p>
          ) : !asking ? (
            <p className="muted">…</p>
          ) : isNew ? (
            <p>
              <strong>Nouvelle position.</strong> Jouez le coup indiqué{answers.length > 1 ? ' (n’importe lequel)' : ''} :{' '}
              {answers.map((m) => m.san).join(' ou ')}.
            </p>
          ) : (
            <p><strong>À vous de jouer.</strong></p>
          )}
          {mistakes > 0 && !played && (
            <p className="error">✗ Pas dans votre répertoire.{revealed ? ' Jouez le coup indiqué.' : ' Réessayez.'}</p>
          )}
          {asking && !revealed && (
            <button className="small" onClick={() => update({ revealed: true })}>Voir la réponse</button>
          )}
        </section>
        {feedback && <FeedbackPanel {...feedback} />}
      </div>
    </div>
  );
}

