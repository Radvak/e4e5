import { chooseReply, START_FEN, type ExplorerResponse, type RepMove } from '@prepa-cahier/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Grade } from '../api';
import { Board } from '../components/Board';
import { answerArrows, lineText, OpponentComment, REPLY_MS } from './common';
import { FeedbackPanel, outcomeOf, type Feedback } from './Feedback';
import type { Source } from './useTrainingSources';

/** Waiting time for statistics before choosing a reply without them. */
const STATS_TIMEOUT_MS = 1500;
/** Pause on a finished line before starting the next one. */
const NEXT_LINE_MS = 700;

type Phase = 'opponent' | 'ask' | 'end';

interface LineState {
  source: Source;
  fen: string;
  history: RepMove[];
  phase: Phase;
  mistakes: number;
  revealed: boolean;
}

/**
 * "Play lines": the app plays the opponent, choosing among the repertoire replies with the
 * frequencies of Lichess players at the selected level; I answer with my repertoire moves until
 * the end of the line. Reviews are recorded only when they inform the schedule: mistakes, new
 * positions, and correct answers on due positions.
 */
export function PlayMode({
  sources,
  root,
  speeds,
  ratings,
  onReview,
}: {
  sources: Source[];
  root: string;
  speeds: string[];
  ratings: number[];
  onReview: (source: Source, fen: string, grade: Grade) => void;
}) {
  const qc = useQueryClient();
  const playable = useMemo(() => sources.filter((s) => s.positions.length > 0), [sources]);
  const [line, setLine] = useState<LineState | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [score, setScore] = useState({ lines: 0, moves: 0, asked: 0, clean: 0 });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const token = useRef(0);

  const statsQuery = useCallback(
    (fen: string) => ({
      queryKey: ['explorer', fen, speeds, ratings],
      queryFn: () => api.explorer(fen, speeds, ratings),
      staleTime: Infinity,
      retry: false,
    }),
    [speeds, ratings],
  );

  /** Statistics of a position, or null if unknown / too slow. */
  const statsOf = (fen: string): Promise<ExplorerResponse | null> =>
    Promise.race([
      qc.fetchQuery(statsQuery(fen)).then((r) => r.data).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), STATS_TIMEOUT_MS)),
    ]);

  /** Where a line goes after a move: opponent to play, my turn, or end of the line. */
  const after = (source: Source, fen: string): Phase => {
    if (source.rep.movesAt(fen).length === 0) return 'end';
    return source.rep.isMyTurn(fen) ? 'ask' : 'opponent';
  };

  const startLine = useCallback(() => {
    token.current++;
    if (!playable.length) return setLine(null);
    // Repertoires are picked in proportion to their size.
    const total = playable.reduce((n, s) => n + s.positions.length, 0);
    let r = Math.random() * total;
    const source = playable.find((s) => (r -= s.positions.length) < 0) ?? playable[0]!;
    const phase = after(source, root);
    setLine({ source, fen: root, history: [], phase, mistakes: 0, revealed: phase === 'ask' && !source.cards.has(root) });
  }, [playable, root]);

  // Latest version (sources change after each review), without restarting timers.
  const startRef = useRef(startLine);
  startRef.current = startLine;

  useEffect(() => {
    if (!line) startLine();
  }, [line, startLine]);

  // Opponent's turn: pick a reply (weighted by statistics), then play it.
  useEffect(() => {
    if (line?.phase !== 'opponent') return;
    const my = ++token.current;
    const started = Date.now();
    void statsOf(line.fen).then((stats) => {
      const reply = chooseReply(line.source.rep.movesAt(line.fen), stats);
      const wait = Math.max(0, REPLY_MS - (Date.now() - started));
      setTimeout(() => {
        if (token.current !== my) return;
        if (!reply) return setLine({ ...line, phase: 'end' });
        const phase = after(line.source, reply.toFen);
        setLine({
          ...line,
          fen: reply.toFen,
          history: [...line.history, reply],
          phase,
          mistakes: 0,
          revealed: phase === 'ask' && !line.source.cards.has(reply.toFen),
        });
      }, wait);
    });
  }, [line?.phase, line?.fen]);

  // End of a line: next one shortly.
  useEffect(() => {
    if (line?.phase !== 'end') return;
    setScore((s) => ({ ...s, lines: s.lines + 1 }));
    const t = setTimeout(() => startRef.current(), NEXT_LINE_MS);
    return () => clearTimeout(t);
  }, [line?.phase]);

  const answers = line && line.phase === 'ask' ? line.source.rep.movesAt(line.fen) : [];

  // While I think, fetch the statistics of the positions my answers lead to.
  useEffect(() => {
    for (const a of answers) void qc.prefetchQuery(statsQuery(a.toFen));
  }, [line?.fen, line?.phase]);

  const play = (uci: string) => {
    if (!line || line.phase !== 'ask') return;
    const answer = answers.find((m) => m.uci === uci);
    if (!answer) {
      setLine({ ...line, mistakes: line.mistakes + 1, revealed: line.revealed || line.mistakes + 1 >= 2 });
      setResetKey((k) => k + 1);
      return;
    }
    const card = line.source.cards.get(line.fen);
    const outcome = outcomeOf(!card, line.mistakes, line.revealed);
    let grade: Grade | null = null;
    if (outcome !== 'correct') grade = 'again'; // new, helped or wrong
    else if (card && Date.parse(card.due) <= Date.now()) grade = 'good';
    if (grade) onReview(line.source, line.fen, grade);
    setScore((s) => ({
      ...s,
      moves: s.moves + 1,
      asked: s.asked + (outcome === 'new' ? 0 : 1),
      clean: s.clean + (outcome === 'correct' ? 1 : 0),
    }));
    setFeedback({ played: answer, others: answers.filter((m) => m.uci !== answer.uci), outcome });
    setLine({ ...line, fen: answer.toFen, history: [...line.history, answer], phase: after(line.source, answer.toFen) });
  };

  const shapes = useMemo(
    () => (line?.phase === 'ask' && line.revealed ? answerArrows(answers) : []),
    [line?.phase, line?.revealed, line?.fen],
  );

  if (!playable.length) return <div className="panel done"><h3>Nothing to train yet</h3></div>;

  const isNew = line?.phase === 'ask' && !line.source.cards.has(line.fen);
  return (
    <div className="editor">
      <div className="editor-board">
        <Board
          fen={line?.fen ?? root ?? START_FEN}
          orientation={line?.source.color ?? playable[0]!.color}
          lastMove={line?.history.at(-1)?.uci}
          shapes={shapes}
          onMove={line?.phase === 'ask' ? play : undefined}
          resetKey={resetKey}
        />
      </div>
      <div className="editor-side">
        <section className="panel">
          {sources.length > 1 && line && <p className="muted small-text">{line.source.name}</p>}
          <p className="muted">{line ? lineText(line.history) || 'Start of the line' : ''}</p>
          {line?.phase === 'ask' && <OpponentComment move={line.history.at(-1)} />}
          {line?.phase === 'opponent' && <p className="muted">Opponent to play…</p>}
          {line?.phase === 'ask' &&
            (isNew ? (
              <p>
                <strong>New position.</strong> Play the move shown: {answers.map((m) => m.san).join(' or ')}.
              </p>
            ) : (
              <p><strong>Your move.</strong></p>
            ))}
          {line?.phase === 'ask' && line.mistakes > 0 && (
            <p className="error">✗ Not in your repertoire.{line.revealed ? ' Play the move shown.' : ' Try again.'}</p>
          )}
          {line?.phase === 'ask' && !line.revealed && (
            <button className="small" onClick={() => setLine({ ...line, revealed: true })}>Show the answer</button>
          )}
          {line?.phase === 'end' && <p className="success">✓ End of the line</p>}
          <p className="muted small-text">
            {score.lines} line(s) · {score.moves} move(s)
            {score.asked > 0 && ` · ${Math.round((100 * score.clean) / score.asked)}% first try`} · opponent moves
            weighted by Lichess {speeds.join('+')} games
          </p>
        </section>
        {feedback && <FeedbackPanel {...feedback} />}
      </div>
    </div>
  );
}
