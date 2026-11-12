import { START_FEN, type RepMove, type TrainingPosition } from '@prepa-cahier/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Grade, ReviewCard } from '../api';
import { Board } from '../components/Board';
import { dayStart } from '../settings';
import { answerArrows, inTime, JUMP_MS, lineText, REPLAY_MS, REPLAYED_PLIES, REPLY_MS } from './common';
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

interface Feedback {
  played: RepMove;
  others: RepMove[];
  clean: boolean;
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
  noNewLimit = false,
}: {
  sources: Source[];
  newPerDay: number;
  /** All unseen positions are available (e.g. training a chosen subtree). */
  noNewLimit?: boolean;
  onReview: (source: Source, fen: string, grade: Grade) => void;
  onCounts: (c: { due: number; fresh: number; reviewed: number; firstTry: number }) => void;
  /** Shown when nothing is left to review. */
  idle: React.ReactNode;
}) {
  const [extraNew, setExtraNew] = useState(0);
  const [ahead, setAhead] = useState(false);
  /** Positions answered in this session (not asked again when reviewing ahead). */
  const answered = useRef(new Set<string>());
  const [stats, setStats] = useState({ reviewed: 0, firstTry: 0 });
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
    const today = dayStart();
    const due: (Item & { at: number })[] = [];
    const fresh: Item[] = [];
    const upcoming: (Item & { at: number })[] = [];
    let unseen = 0;
    for (const source of sources) {
      const learntToday = source.cardList.filter((c) => Date.parse(c.createdAt) >= today).length;
      let allowed = noNewLimit ? Infinity : Math.max(0, newPerDay + extraNew - learntToday);
      for (const target of source.positions) {
        const card: ReviewCard | undefined = source.cards.get(target.fen);
        if (!card) {
          unseen++;
          if (allowed-- > 0) fresh.push({ source, target });
        } else if (Date.parse(card.due) <= now) due.push({ source, target, at: Date.parse(card.due) });
        else upcoming.push({ source, target, at: Date.parse(card.due) });
      }
    }
    due.sort((a, b) => a.at - b.at);
    upcoming.sort((a, b) => a.at - b.at);
    const nextDue = upcoming[0] ? new Date(upcoming[0].at) : undefined;
    const early = upcoming.filter((p) => !answered.current.has(`${p.source.id}|${p.target.fen}`));
    const items: Item[] = [...due, ...fresh, ...(ahead ? early : [])];
    return { due, fresh, items, unseen, nextDue, early: early.length };
  }, [sources, now, newPerDay, extraNew, noNewLimit, ahead]);

  useEffect(() => {
    onCounts({ due: queue.due.length, fresh: queue.fresh.length, ...stats });
  }, [queue.due.length, queue.fresh.length, stats, onCounts]);

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

  const onAnswered = (q: Question, played: RepMove, grade: Grade, clean: boolean) => {
    answered.current.add(`${q.source.id}|${q.target.fen}`);
    onReview(q.source, q.target.fen, grade);
    setStats((s) => ({ reviewed: s.reviewed + 1, firstTry: s.firstTry + (clean ? 1 : 0) }));
    setFeedback({ played, others: q.source.rep.movesAt(q.target.fen).filter((m) => m.uci !== played.uci), clean });
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
        <h3>{sources.every((s) => s.positions.length === 0) ? 'Nothing to train here' : 'All done for now 🎉'}</h3>
        {sources.every((s) => s.positions.length === 0) && (
          <p className="muted">No position where it is your turn in these lines: add (and save) moves for your side first.</p>
        )}
        {queue.nextDue && <p>Next review {inTime(queue.nextDue)}.</p>}
        <div className="row">
          {queue.unseen > 0 && (
            <button className="primary" onClick={() => setExtraNew((n) => n + 10)}>
              Learn {Math.min(10, queue.unseen)} new position(s) ({queue.unseen} not learnt yet)
            </button>
          )}
          {queue.early > 0 && (
            <button
              onClick={() => {
                setAhead(true);
                setNow(Date.now());
              }}
            >
              Review ahead ({queue.early} learnt, not due yet)
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
      onAnswered={(played, grade, clean) => onAnswered(current, played, grade, clean)}
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
  onAnswered: (played: RepMove, grade: Grade, clean: boolean) => void;
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
  });
  const [state, setState] = useState(fresh);
  // New question: reset the state during render (keeps the board mounted, no flash).
  const current = state.round === round ? state : fresh();
  if (state.round !== round) setState(current);
  const { replied, shown, mistakes, revealed, played } = current;
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

  const asking = replied && shown >= plies && !played;
  const play = (uci: string) => {
    if (!asking) return;
    const answer = answers.find((m) => m.uci === uci);
    if (!answer) {
      update({ mistakes: mistakes + 1, revealed: revealed || mistakes + 1 >= 2 });
      setResetKey((k) => k + 1);
      return;
    }
    update({ played: answer });
    const clean = !isNew && !revealed && mistakes === 0;
    // New or helped: asked again soon. Right first time: good.
    onAnswered(answer, clean ? 'good' : 'again', clean);
  };

  let boardFen: string;
  let lastMove: string | undefined;
  if (played) [boardFen, lastMove] = [played.toFen, played.uci];
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
      </div>
      <div className="editor-side">
        <section className="panel">
          {showName && <p className="muted small-text">{source.name}</p>}
          <p className="muted">{lineText(target.path.slice(0, shown)) || 'Initial position'}</p>
          {played ? (
            <p className="success">✓ {played.san}</p>
          ) : !asking ? (
            <p className="muted">…</p>
          ) : isNew ? (
            <p>
              <strong>New position.</strong> Play the move shown{answers.length > 1 ? ' (any of them)' : ''}:{' '}
              {answers.map((m) => m.san).join(' or ')}.
            </p>
          ) : (
            <p><strong>Your move.</strong></p>
          )}
          {mistakes > 0 && !played && (
            <p className="error">✗ Not in your repertoire.{revealed ? ' Play the move shown.' : ' Try again.'}</p>
          )}
          {asking && !revealed && (
            <button className="small" onClick={() => update({ revealed: true })}>Show the answer</button>
          )}
        </section>
        {feedback && <FeedbackPanel {...feedback} />}
      </div>
    </div>
  );
}

export function FeedbackPanel({ played, others, clean }: Feedback) {
  return (
    <section className="panel feedback">
      <p>
        <span className={clean ? 'success' : 'warning'}>{clean ? '✓' : '↻'} {played.san}</span>
        {others.length > 0 && <span className="muted"> · also in your repertoire: {others.map((m) => m.san).join(', ')}</span>}
      </p>
      {played.comment && <p className="comment">{played.comment}</p>}
    </section>
  );
}
