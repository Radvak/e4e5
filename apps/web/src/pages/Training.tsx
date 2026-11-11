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

/** Plies replayed with animation before a question (earlier moves are shown at once). */
const REPLAYED_PLIES = 4;
const REPLAY_MS = 450;

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

export function Training() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { newPerDay, setNewPerDay } = useSettings();
  const repQuery = useQuery({ queryKey: ['repertoire', id], queryFn: () => api.repertoire(id) });
  const cardsQuery = useQuery({ queryKey: ['cards', id], queryFn: () => api.cards(id) });
  const [extraNew, setExtraNew] = useState(0);
  const [round, setRound] = useState(0);
  const [stats, setStats] = useState({ reviewed: 0, firstTry: 0 });
  const [now, setNow] = useState(() => Date.now());

  // Learning steps are minutes long: re-check what is due regularly.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const rep = useMemo(
    () => new Repertoire(repQuery.data?.color ?? 'white', repQuery.data?.moves ?? []),
    [repQuery.data],
  );
  const positions = useMemo(() => trainingPositions(rep), [rep]);
  const cards = useMemo(() => new Map((cardsQuery.data ?? []).map((c) => [c.fen, c])), [cardsQuery.data]);

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
    const upcoming = positions
      .map((p) => cards.get(p.fen))
      .filter((c): c is ReviewCard => !!c && Date.parse(c.due) > now)
      .map((c) => new Date(c.due))
      .sort((a, b) => a.getTime() - b.getTime());
    return { due, fresh, unseen: unseen.length, next: due[0] ?? fresh[0], nextDue: upcoming[0] };
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

  // The question on screen stays fixed until "next", even when the queue changes meanwhile.
  const [current, setCurrent] = useState<{ target: TrainingPosition; isNew: boolean } | null>(null);
  useEffect(() => {
    if (!current && queue.next) setCurrent({ target: queue.next, isNew: !cards.has(queue.next.fen) });
  }, [current, queue.next, cards]);

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
          key={`${current.target.fen}-${round}`}
          rep={rep}
          target={current.target}
          isNew={current.isNew}
          onAnswered={(grade, firstTry) => {
            review.mutate({ fen: current.target.fen, grade });
            setStats((s) => ({ reviewed: s.reviewed + 1, firstTry: s.firstTry + (firstTry ? 1 : 0) }));
          }}
          onNext={() => {
            setNow(Date.now());
            setRound((r) => r + 1);
            setCurrent(null);
          }}
        />
      ) : queue.next ? null : (
        <div className="panel done">
          <h3>{positions.length === 0 ? 'Nothing to train yet' : 'All done for now 🎉'}</h3>
          {positions.length === 0 && (
            <p className="muted">Add moves for your side to this repertoire first.</p>
          )}
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

type Phase = 'replay' | 'ask' | 'correct';

/**
 * One question: replays the line up to the position, then waits for one of the repertoire
 * moves. New positions show the answer first. Two wrong tries reveal the answer.
 */
function Drill({
  rep,
  target,
  isNew,
  onAnswered,
  onNext,
}: {
  rep: Repertoire;
  target: TrainingPosition;
  isNew: boolean;
  onAnswered: (grade: Grade, firstTry: boolean) => void;
  onNext: () => void;
}) {
  const { path, fen } = target;
  const start = Math.max(0, path.length - REPLAYED_PLIES);
  const [shown, setShown] = useState(start); // plies of the path on the board
  const [phase, setPhase] = useState<Phase>(path.length > start ? 'replay' : 'ask');
  const [mistakes, setMistakes] = useState(0);
  const [revealed, setRevealed] = useState(isNew);
  const [resetKey, setResetKey] = useState(0);
  const [played, setPlayed] = useState<RepMove | null>(null);
  const answers = rep.movesAt(fen);
  const next = useRef(onNext);
  next.current = onNext;

  // Replay the last moves of the line.
  useEffect(() => {
    if (phase !== 'replay') return;
    if (shown >= path.length) return setPhase('ask');
    const t = setTimeout(() => setShown((n) => n + 1), REPLAY_MS);
    return () => clearTimeout(t);
  }, [phase, shown, path.length]);

  const play = (uci: string) => {
    if (phase !== 'ask') return;
    const answer = answers.find((m) => m.uci === uci);
    if (!answer) {
      setMistakes((n) => n + 1);
      if (mistakes + 1 >= 2) setRevealed(true);
      setResetKey((k) => k + 1);
      return;
    }
    setPlayed(answer);
    setPhase('correct');
    // New: seen with the answer, asked again in a minute. Otherwise right first time = good.
    const grade: Grade = isNew || revealed || mistakes > 0 ? 'again' : 'good';
    onAnswered(grade, !isNew && !revealed && mistakes === 0);
  };

  // After a correct answer: continue automatically, unless there is a comment to read.
  useEffect(() => {
    if (phase !== 'correct' || played?.comment) return;
    const t = setTimeout(() => next.current(), 900);
    return () => clearTimeout(t);
  }, [phase, played]);

  useEffect(() => {
    if (phase !== 'correct') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') next.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const boardFen = phase === 'correct' && played ? played.toFen : (path[shown - 1]?.toFen ?? START_FEN);
  const lastMove = phase === 'correct' && played ? played.uci : path[shown - 1]?.uci;
  const shapes = useMemo<DrawShape[]>(
    () =>
      revealed && phase === 'ask'
        ? answers.map((m) => ({ orig: m.uci.slice(0, 2) as Key, dest: m.uci.slice(2, 4) as Key, brush: 'repertoire' }))
        : [],
    [revealed, phase, answers],
  );
  const others = played ? answers.filter((m) => m.uci !== played.uci) : [];

  return (
    <div className="editor">
      <div className="editor-board">
        <Board
          fen={boardFen}
          orientation={rep.color}
          lastMove={lastMove}
          shapes={shapes}
          onMove={phase === 'ask' ? play : undefined}
          resetKey={resetKey}
        />
      </div>
      <div className="editor-side">
        <section className="panel">
          <p className="muted">{lineText(path.slice(0, shown)) || 'Initial position'}</p>
          {phase === 'replay' && <p>…</p>}
          {phase === 'ask' && (
            <>
              {isNew ? (
                <p>
                  <strong>New position.</strong> Play the move shown
                  {answers.length > 1 ? ' (any of them)' : ''}: {answers.map((m) => m.san).join(' or ')}.
                </p>
              ) : (
                <p><strong>Your move.</strong></p>
              )}
              {mistakes > 0 && (
                <p className="error">
                  ✗ Not in your repertoire.{revealed ? ' Play the move shown.' : ' Try again.'}
                </p>
              )}
              {!revealed && (
                <button className="small" onClick={() => setRevealed(true)}>Show the answer</button>
              )}
            </>
          )}
          {phase === 'correct' && played && (
            <>
              <p className="success">✓ {played.san}</p>
              {others.length > 0 && <p className="muted">Also in your repertoire: {others.map((m) => m.san).join(', ')}.</p>}
              {played.comment && <p className="comment">{played.comment}</p>}
              <button className="primary" onClick={onNext}>Continue (Enter)</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
