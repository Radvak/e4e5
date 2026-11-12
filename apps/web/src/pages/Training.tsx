import {
  Repertoire,
  START_FEN,
  trainingPositions,
  type RepMove,
  type TrainingPosition,
} from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Grade, type ReviewCard } from '../api';
import { Board } from '../components/Board';
import { dayStart, useSettings } from '../settings';

/** Pause before the opponent's reply when the line continues. */
const REPLY_MS = 300;
/** Pause on a correct answer before jumping to another line. */
const JUMP_MS = 350;

function lineText(path: RepMove[]): string {
  return path.map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m.san}`).join(' ');
}

/** Short "in 3 min" / "in 2 h" / "in 4 days". */
function inTime(date: Date): string {
  const min = Math.max(1, Math.round((date.getTime() - Date.now()) / 60_000));
  if (min < 60) return `in ${min} min`;
  if (min < 48 * 60) return `in ${Math.round(min / 60)} h`;
  return `in ${Math.round(min / 1440)} days`;
}

interface Question {
  target: TrainingPosition;
  isNew: boolean;
  /** When the line continues: my last move, then the opponent's reply leading to `target`. */
  lead?: { mine: RepMove; reply: RepMove };
}

interface Feedback {
  played: RepMove;
  /** Other repertoire moves in that position. */
  others: RepMove[];
  clean: boolean;
}

export function Training() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { newPerDay, setNewPerDay } = useSettings();
  const repQuery = useQuery({ queryKey: ['repertoire', id], queryFn: () => api.repertoire(id) });
  const cardsQuery = useQuery({ queryKey: ['cards', id], queryFn: () => api.cards(id) });
  const [extraNew, setExtraNew] = useState(0);
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

  const rep = useMemo(
    () => new Repertoire(repQuery.data?.color ?? 'white', repQuery.data?.moves ?? []),
    [repQuery.data],
  );
  const positions = useMemo(() => trainingPositions(rep), [rep]);
  const cards = useMemo(() => new Map((cardsQuery.data ?? []).map((c) => [c.fen, c])), [cardsQuery.data]);

  /** Positions to ask, by priority: due (oldest first), then new ones (learning order). */
  const queue = useMemo(() => {
    const due = positions
      .filter((p) => {
        const c = cards.get(p.fen);
        return c && Date.parse(c.due) <= now;
      })
      .sort((a, b) => Date.parse(cards.get(a.fen)!.due) - Date.parse(cards.get(b.fen)!.due));
    const learntToday = (cardsQuery.data ?? []).filter((c) => Date.parse(c.createdAt) >= dayStart()).length;
    const unseen = positions.filter((p) => !cards.has(p.fen));
    const fresh = unseen.slice(0, Math.max(0, newPerDay + extraNew - learntToday));
    const nextDue = positions
      .map((p) => cards.get(p.fen))
      .filter((c): c is ReviewCard => !!c && Date.parse(c.due) > now)
      .map((c) => new Date(c.due))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return { due, fresh, items: [...due, ...fresh], unseen: unseen.length, nextDue };
  }, [positions, cards, cardsQuery.data, now, newPerDay, extraNew]);

  const putCard = (card: ReviewCard) =>
    qc.setQueryData<ReviewCard[]>(['cards', id], (old = []) => [...old.filter((c) => c.fen !== card.fen), card]);
  const review = useMutation({
    mutationFn: ({ fen, grade }: { fen: string; grade: Grade }) => api.review(id, fen, grade),
    onMutate: ({ fen }) => {
      // Optimistic: not due any more until the server answers with the real schedule.
      const old = cards.get(fen);
      const soon = new Date(Date.now() + 60_000).toISOString();
      putCard({ fen, due: soon, reps: (old?.reps ?? 0) + 1, lapses: old?.lapses ?? 0, createdAt: old?.createdAt ?? new Date().toISOString() });
    },
    onSuccess: (card) => {
      putCard(card);
      qc.invalidateQueries({ queryKey: ['training-summary'] });
    },
    onError: () => qc.invalidateQueries({ queryKey: ['cards', id] }),
  });

  const ask = (q: Question | null) => {
    setCurrent(q);
    setRound((r) => r + 1);
  };

  // First question, and questions becoming due while idle.
  useEffect(() => {
    if (!current && queue.items[0] && !jumpTimer.current) {
      ask({ target: queue.items[0], isNew: !cards.has(queue.items[0].fen) });
    }
  }, [current, queue.items, cards]);

  /** Next question after answering `answered` with `played`: follow the line if possible. */
  const nextAfter = (answered: string, played: RepMove): Question | null => {
    const items = queue.items.filter((p) => p.fen !== answered);
    const replies = new Map(rep.movesAt(played.toFen).map((m) => [m.toFen, m]));
    const follow = items.find((p) => replies.has(p.fen));
    if (follow) {
      return { target: follow, isNew: !cards.has(follow.fen), lead: { mine: played, reply: replies.get(follow.fen)! } };
    }
    const first = items[0];
    return first ? { target: first, isNew: !cards.has(first.fen) } : null;
  };

  const onAnswered = (q: Question, played: RepMove, grade: Grade, clean: boolean) => {
    review.mutate({ fen: q.target.fen, grade });
    setStats((s) => ({ reviewed: s.reviewed + 1, firstTry: s.firstTry + (clean ? 1 : 0) }));
    setFeedback({ played, others: rep.movesAt(q.target.fen).filter((m) => m.uci !== played.uci), clean });
    const next = nextAfter(q.target.fen, played);
    if (next?.lead) return ask(next);
    // Jumping elsewhere (or done): leave the correct move on the board for a moment.
    jumpTimer.current = setTimeout(() => {
      jumpTimer.current = undefined;
      setNow(Date.now());
      ask(next);
    }, JUMP_MS);
  };

  if (repQuery.isLoading || cardsQuery.isLoading) return <p>Loading…</p>;
  if (!repQuery.data) return <p className="error">Could not load the repertoire.</p>;

  return (
    <div className="training">
      <header className="row">
        <Link to={`/r/${id}`}>← {repQuery.data.name}</Link>
        <h2>Training</h2>
        <span className="muted">
          {queue.due.length} due · {queue.fresh.length} new · {stats.reviewed} done
          {stats.reviewed > 0 && ` (${Math.round((100 * stats.firstTry) / stats.reviewed)}% first try)`}
        </span>
        <label className="muted">
          New per day{' '}
          <select value={newPerDay} onChange={(e) => setNewPerDay(Number(e.target.value))}>
            {[0, 5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </header>

      {current ? (
        <Drill
          round={round}
          rep={rep}
          question={current}
          feedback={feedback}
          onAnswered={(played, grade, clean) => onAnswered(current, played, grade, clean)}
        />
      ) : (
        <div className="panel done">
          <h3>{positions.length === 0 ? 'Nothing to train yet' : 'All done for now 🎉'}</h3>
          {positions.length === 0 && <p className="muted">Add moves for your side to this repertoire first.</p>}
          {queue.nextDue && <p>Next review {inTime(queue.nextDue)}.</p>}
          {queue.unseen > 0 && (
            <p>
              {queue.unseen} position(s) not learnt yet.{' '}
              <button onClick={() => setExtraNew((n) => n + 10)}>Learn 10 more</button>
            </p>
          )}
          {review.error && <p className="error">{review.error.message}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * One question. When the line continues, the board first shows my previous move, then plays
 * the opponent's reply. New positions show the answer; two wrong tries reveal it.
 */
function Drill({
  round,
  rep,
  question,
  feedback,
  onAnswered,
}: {
  /** Changes with each question. Not used as a React key: the board must stay mounted. */
  round: number;
  rep: Repertoire;
  question: Question;
  feedback: Feedback | null;
  onAnswered: (played: RepMove, grade: Grade, clean: boolean) => void;
}) {
  const { target, isNew, lead } = question;
  const fresh = () => ({ round, replied: !lead, mistakes: 0, revealed: isNew, played: null as RepMove | null });
  const [state, setState] = useState(fresh);
  // New question: reset the state during render (keeps the board mounted, no flash).
  const current = state.round === round ? state : fresh();
  if (state.round !== round) setState(current);
  const { replied, mistakes, revealed, played } = current;
  const update = (patch: Partial<typeof current>) => setState((s) => ({ ...s, ...patch }));
  const [resetKey, setResetKey] = useState(0);
  const answers = rep.movesAt(target.fen);

  useEffect(() => {
    if (replied) return;
    const t = setTimeout(() => update({ replied: true }), REPLY_MS);
    return () => clearTimeout(t);
  }, [replied, round]);

  const asking = replied && !played;
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
  else [boardFen, lastMove] = [target.fen, (lead?.reply ?? target.path.at(-1))?.uci];

  const shapes = useMemo<DrawShape[]>(
    () =>
      revealed && asking
        ? answers.map((m) => ({ orig: m.uci.slice(0, 2) as Key, dest: m.uci.slice(2, 4) as Key, brush: 'repertoire' }))
        : [],
    [revealed, asking, answers],
  );

  return (
    <div className="editor">
      <div className="editor-board">
        <Board
          fen={boardFen || START_FEN}
          orientation={rep.color}
          lastMove={lastMove}
          shapes={shapes}
          onMove={asking ? play : undefined}
          resetKey={resetKey}
        />
      </div>
      <div className="editor-side">
        <section className="panel">
          <p className="muted">{lineText(target.path) || 'Initial position'}</p>
          {played ? (
            <p className="success">✓ {played.san}</p>
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

        {feedback && (
          <section className="panel feedback">
            <p>
              <span className={feedback.clean ? 'success' : 'warning'}>{feedback.clean ? '✓' : '↻'} {feedback.played.san}</span>
              {feedback.others.length > 0 && (
                <span className="muted"> · also in your repertoire: {feedback.others.map((m) => m.san).join(', ')}</span>
              )}
            </p>
            {feedback.played.comment && <p className="comment">{feedback.played.comment}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
