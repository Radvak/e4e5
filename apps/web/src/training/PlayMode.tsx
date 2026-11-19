import { chooseReply, START_FEN, type ExplorerResponse, type RepMove } from '@tabiya/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Grade } from '../api';
import { Board } from '../components/Board';
import { OpeningName } from '../components/OpeningName';
import { answerArrows, lineText, OpponentComment, REPLY_MS } from './common';
import { outcomeOf } from './Feedback';
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
  onLearn,
}: {
  sources: Source[];
  root: string;
  speeds: string[];
  ratings: number[];
  onReview: (source: Source, fen: string, uci: string, grade: Grade) => void;
  /** Switch to "Réviser" (offered when nothing is learnt yet). */
  onLearn?: () => void;
}) {
  const qc = useQueryClient();
  /**
   * "Se tester" only covers what is learnt: a position is known once one of my moves there is
   * learnt. The opponent only plays replies leading to a known position; the line ends when none does.
   */
  const known = (source: Source, fen: string) => !!source.positionCard(fen);
  const knownReplies = (source: Source, fen: string) => source.rep.movesAt(fen).filter((m) => known(source, m.toFen));
  /** Where a line goes after a move: opponent to play, my turn, or end of what is known. */
  const after = (source: Source, fen: string): Phase => {
    if (source.rep.isMyTurn(fen)) return known(source, fen) ? 'ask' : 'end';
    return knownReplies(source, fen).length > 0 ? 'opponent' : 'end';
  };
  const playable = useMemo(
    () => sources.filter((s) => after(s, root) !== 'end').map((s) => ({ s, learnt: s.positions.filter((p) => known(s, p.fen)).length })),
    [sources, root],
  );
  const [line, setLine] = useState<LineState | null>(null);
  const [score, setScore] = useState({ lines: 0, moves: 0, asked: 0, clean: 0 });
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

  const startLine = useCallback(() => {
    token.current++;
    if (!playable.length) return setLine(null);
    // Repertoires are picked in proportion to what is learnt in them.
    const total = playable.reduce((n, p) => n + p.learnt, 0);
    let r = Math.random() * total;
    const source = (playable.find((p) => (r -= p.learnt) < 0) ?? playable[0]!).s;
    setLine({ source, fen: root, history: [], phase: after(source, root), mistakes: 0, revealed: false });
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
      const reply = chooseReply(knownReplies(line.source, line.fen), stats);
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
          revealed: false,
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
      return false;
    }
    // Any of my moves is accepted; its card is graded (a move not learnt yet, found without
    // help, is left to the review, where it is shown first).
    const card = line.source.cardOf(line.fen, answer.uci);
    const outcome = outcomeOf(false, line.mistakes, line.revealed);
    let grade: Grade | null = null;
    if (outcome !== 'correct') grade = 'again'; // helped or wrong
    else if (card && Date.parse(card.due) <= Date.now()) grade = 'good';
    if (grade) onReview(line.source, line.fen, answer.uci, grade);
    setScore((s) => ({
      ...s,
      moves: s.moves + 1,
      asked: s.asked + (outcome === 'new' ? 0 : 1),
      clean: s.clean + (outcome === 'correct' ? 1 : 0),
    }));
    setLine({ ...line, fen: answer.toFen, history: [...line.history, answer], phase: after(line.source, answer.toFen) });
  };

  const shapes = useMemo(
    () => (line?.phase === 'ask' && line.revealed ? answerArrows(answers) : []),
    [line?.phase, line?.revealed, line?.fen],
  );

  if (!playable.length) {
    return (
      <div className="panel done">
        <h3>Rien à tester pour l’instant</h3>
        <p className="muted">« Se tester » porte sur ce que vous avez appris. Apprenez d’abord quelques positions dans « Réviser ».</p>
        {onLearn && <button className="primary" onClick={onLearn}>Réviser</button>}
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor-board">
        <OpeningName ucis={line?.history.map((m) => m.uci) ?? []} />
        <Board
          fen={line?.fen ?? root ?? START_FEN}
          orientation={line?.source.color ?? playable[0]!.s.color}
          lastMove={line?.history.at(-1)?.uci}
          shapes={shapes}
          onMove={line?.phase === 'ask' ? play : undefined}
        />
      </div>
      <div className="editor-side">
        <section className="panel">
          {sources.length > 1 && line && <p className="muted small-text">{line.source.name}</p>}
          <p className="muted">{line ? lineText(line.history) || 'Début de la ligne' : ''}</p>
          {line?.phase === 'ask' && <OpponentComment move={line.history.at(-1)} />}
          {line?.phase === 'opponent' && <p className="muted">L’adversaire joue…</p>}
          {line?.phase === 'ask' && <p><strong>À vous de jouer.</strong></p>}
          {line?.phase === 'ask' && line.mistakes > 0 && (
            <p className="error">✗ Pas dans votre répertoire.{line.revealed ? ' Jouez le coup indiqué.' : ' Réessayez.'}</p>
          )}
          {line?.phase === 'ask' && !line.revealed && (
            <button className="small" onClick={() => setLine({ ...line, revealed: true })}>Voir la réponse</button>
          )}
          {line?.phase === 'end' && <p className="success">✓ Fin de ce que vous connaissez</p>}
          <p className="muted small-text">
            {score.lines} ligne(s) · {score.moves} coup(s)
            {score.asked > 0 && ` · ${Math.round((100 * score.clean) / score.asked)} % du premier coup`} · coups adverses
            pondérés par les parties Lichess
          </p>
        </section>
      </div>
    </div>
  );
}
