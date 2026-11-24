import { chooseReply, pathTo, Repertoire, START_FEN, type Color, type ExplorerResponse, type RepMove, type TrainingPosition } from '@e4e5/core';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Grade } from '../api';
import { Board } from '../components/Board';
import { OpeningName } from '../components/OpeningName';
import { AnswerTimer, useAnswerClock } from './AnswerTimer';
import { answerArrows, REPLY_MS, savedSession, saveSession } from './common';
import { DrillActions, LineDone, QuizLine, SwipeBar, useMyMovesHere } from './DrillParts';
import { outcomeOf } from './Feedback';
import type { Source } from './useTrainingSources';
import { t } from '../i18n';

/** Waiting time for statistics before choosing a reply without them. */
const STATS_TIMEOUT_MS = 1500;
/** Pause on a finished line before starting the next one. */
const NEXT_LINE_MS = 700;

type Phase = 'opponent' | 'ask' | 'end';

/**
 * The repertoires of one colour, tested together: the cards are shared (a move learnt is learnt
 * in every repertoire having it), so a line goes on in whichever repertoire its sequel was
 * learnt (1. e4 e5 2. Nf3 learnt in the Scotch also stands in the Philidor and Petrov ones).
 */
interface Side {
  id: string;
  color: Color;
  /** Every move of these repertoires (one per position and move). */
  rep: Repertoire;
  positions: TrainingPosition[];
  /** One of my moves learnt here. */
  known: (fen: string) => boolean;
  pausedAt: (fen: string) => RepMove[];
  cardOf: Source['cardOf'];
  /** The repertoire a move of mine is recorded in (the first having it). */
  sourceOf: (fen: string, uci: string) => Source;
  /**
   * Expected number of my mistakes from `fen` on, along what can be tested: the sum, over the
   * positions of mine learnt there, of the chance of missing them today (how hard the line is).
   */
  mistakesFrom: (fen: string) => number;
}

function sideOf(color: Color, group: Source[], rep: Repertoire): Side {
  const positions = new Map<string, TrainingPosition>();
  for (const s of group) for (const p of s.positions) if (!positions.has(p.fen)) positions.set(p.fen, p);
  const known = (fen: string) => group.some((s) => !!s.positionCard(fen));
  /** Chance of missing a position today: any of my moves is accepted, so the best known one counts. */
  const missChance = (fen: string) => 1 - Math.max(0, ...rep.movesAt(fen).map((m) => group[0]!.cardOf(fen, m.uci)?.recall ?? 0));
  const counted = new Map<string, number>();
  const mistakesFrom = (fen: string) => {
    let n = counted.get(fen);
    if (n !== undefined) return n;
    // The positions reached by my moves and the replies leading to a known position (each
    // counted once, transpositions included).
    const seen = new Set<string>();
    const stack = [fen];
    n = 0;
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      const mine = rep.isMyTurn(f);
      if (mine && !known(f)) continue;
      if (mine) n += missChance(f);
      for (const m of rep.movesAt(f)) if (mine || known(m.toFen)) stack.push(m.toFen);
    }
    counted.set(fen, n);
    return n;
  };
  return {
    id: `side:${color}`,
    color,
    rep,
    positions: [...positions.values()],
    known,
    pausedAt: (fen) => group.flatMap((s) => s.pausedAt(fen)),
    cardOf: (fen, uci) => group[0]!.cardOf(fen, uci),
    sourceOf: (fen, uci) => group.find((s) => s.rep.has(fen, uci)) ?? group[0]!,
    mistakesFrom,
  };
}

/** The merged graph of each colour, built again only when a repertoire changes (not after an answer). */
function useSides(sources: Source[]): Side[] {
  const reps = useRef<{ list: Repertoire[]; merged: Map<Color, Repertoire> } | null>(null);
  const list = sources.map((s) => s.rep);
  if (!reps.current || reps.current.list.length !== list.length || reps.current.list.some((r, i) => r !== list[i])) {
    const merged = new Map<Color, Repertoire>();
    for (const s of sources) {
      const rep = merged.get(s.color) ?? new Repertoire(s.color);
      for (const m of s.rep.all()) rep.add(m);
      merged.set(s.color, rep);
    }
    reps.current = { list, merged };
  }
  const merged = reps.current.merged;
  return useMemo(() => [...merged].map(([color, rep]) => sideOf(color, sources.filter((s) => s.color === color), rep)), [sources, merged]);
}

interface LineState {
  side: Side;
  fen: string;
  history: RepMove[];
  phase: Phase;
  mistakes: number;
  revealed: boolean;
  /** The pieces to move are shown (Indice). */
  hinted: boolean;
}

/** Score of the session: lines played, my moves, asked (learnt) and right first time. */
export interface PlayScore {
  lines: number;
  moves: number;
  asked: number;
  clean: number;
}

/** Ply of a position (from its FEN): where the line of the quiz starts. */
const plyOf = (fen: string) => {
  const [, turn, , , , full] = fen.split(' ');
  return (Math.max(1, Number(full) || 1) - 1) * 2 + (turn === 'b' ? 1 : 0);
};

/**
 * "Se tester": the app plays the opponent, choosing among the repertoire replies with the
 * frequencies of Lichess players at the selected level (smoothed, and raised for the lines with
 * hard positions behind: core replyWeights); I answer with my repertoire moves until
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
  onScore,
  sessionKey,
}: {
  sources: Source[];
  root: string;
  speeds: string[];
  ratings: number[];
  onReview: (source: Source, fen: string, uci: string, grade: Grade) => void;
  /** Switch to "Réviser" (offered when nothing is learnt yet). */
  onLearn?: () => void;
  /** The score of the session (shown in the page header, like the review's). */
  onScore?: (score: PlayScore) => void;
  /** The scope of the session: put aside under this key when the page is left, taken up on return. */
  sessionKey?: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  /**
   * "Se tester" only covers what is learnt: a position is known once one of my moves there is
   * learnt. The opponent only plays replies leading to a known position; the line ends when none
   * does. The repertoires of a colour are tested together (`Side`).
   */
  const sides = useSides(sources);
  const knownReplies = (side: Side, fen: string) => side.rep.movesAt(fen).filter((m) => side.known(m.toFen));
  /** Where a line goes after a move: opponent to play, my turn, or end of what is known. */
  const after = (side: Side, fen: string): Phase => {
    if (side.rep.isMyTurn(fen)) return side.known(fen) ? 'ask' : 'end';
    return knownReplies(side, fen).length > 0 ? 'opponent' : 'end';
  };
  const playable = useMemo(
    () => sides.filter((s) => after(s, root) !== 'end').map((s) => ({ s, learnt: s.positions.filter((p) => s.known(p.fen)).length })),
    [sides, root],
  );
  /** The session put aside when the page was left (e.g. for the explorer): the same line, the same score. */
  const [saved] = useState(() => {
    const s = sessionKey ? savedSession<{ line: LineState | null; score: PlayScore }>(sessionKey) : undefined;
    if (!s) return undefined;
    const side = s.line && sides.find((x) => x.id === s.line!.side.id);
    // A finished line (or a colour no longer here): the next one.
    const line = s.line && side && s.line.phase !== 'end' ? { ...s.line, side } : null;
    return { line, score: s.score };
  });
  const [line, setLine] = useState<LineState | null>(saved?.line ?? null);
  const [score, setScore] = useState<PlayScore>(saved?.score ?? { lines: 0, moves: 0, asked: 0, clean: 0 });
  const kept = useRef({ line, score });
  kept.current = { line, score };
  useEffect(() => {
    if (!sessionKey) return;
    return () => saveSession(sessionKey, kept.current);
  }, [sessionKey]);
  useEffect(() => onScore?.(score), [score, onScore]);
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
    // Colours are picked in proportion to what is learnt with them.
    const total = playable.reduce((n, p) => n + p.learnt, 0);
    let r = Math.random() * total;
    const side = (playable.find((p) => (r -= p.learnt) < 0) ?? playable[0]!).s;
    setLine({ side, fen: root, history: [], phase: after(side, root), mistakes: 0, revealed: false, hinted: false });
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
      // Real frequency at my level, smoothed, and more often the replies with hard positions behind.
      const reply = chooseReply(knownReplies(line.side, line.fen), stats, Math.random, { difficulty: (m) => line.side.mistakesFrom(m.toFen) });
      const wait = Math.max(0, REPLY_MS - (Date.now() - started));
      setTimeout(() => {
        if (token.current !== my) return;
        if (!reply) return setLine({ ...line, phase: 'end' });
        const phase = after(line.side, reply.toFen);
        setLine({
          ...line,
          fen: reply.toFen,
          history: [...line.history, reply],
          phase,
          mistakes: 0,
          revealed: false,
          hinted: false,
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

  const answers = line && line.phase === 'ask' ? line.side.rep.movesAt(line.fen) : [];
  const elsewhere = useMyMovesHere(line?.phase === 'ask' ? line.fen : undefined, line?.side.color ?? 'white');

  // While I think, fetch the statistics of the positions my answers lead to.
  useEffect(() => {
    for (const a of answers) void qc.prefetchQuery(statsQuery(a.toFen));
  }, [line?.fen, line?.phase]);

  /** `helped`: played with the Solution button (counted as helped). */
  const play = (uci: string, helped = false) => {
    if (!line || line.phase !== 'ask') return;
    const answer = answers.find((m) => m.uci === uci);
    // A move of mine put on pause, or of another of my repertoires: not a mistake, try again.
    if (!answer && (line.side.pausedAt(line.fen).some((m) => m.uci === uci) || elsewhere(uci))) return 'retry';
    if (!answer) {
      setLine({ ...line, mistakes: line.mistakes + 1, revealed: line.revealed || line.mistakes + 1 >= 2 });
      return false;
    }
    // Any of my moves is accepted; its card is graded (a move not learnt yet, found without
    // help, is left to the review, where it is shown first).
    const card = line.side.cardOf(line.fen, answer.uci);
    const outcome = outcomeOf(false, line.mistakes, line.revealed || line.hinted || helped);
    let grade: Grade | null = null;
    if (outcome !== 'correct') grade = 'again'; // helped or wrong
    else if (card && Date.parse(card.due) <= Date.now()) grade = 'good';
    if (grade) onReview(line.side.sourceOf(line.fen, answer.uci), line.fen, answer.uci, grade);
    setScore((s) => ({
      ...s,
      moves: s.moves + 1,
      asked: s.asked + (outcome === 'new' ? 0 : 1),
      clean: s.clean + (outcome === 'correct' ? 1 : 0),
    }));
    setLine({ ...line, fen: answer.toFen, history: [...line.history, answer], phase: after(line.side, answer.toFen), mistakes: 0, revealed: false, hinted: false });
  };

  /** One button, like the review's: the pieces to move, then the solution (my main move is played, helped). */
  const hint = () => {
    if (!line || line.phase !== 'ask') return;
    if (!line.hinted && !line.revealed) return setLine({ ...line, hinted: true });
    const main = answers.find((m) => m.isMain) ?? answers[0];
    if (main) play(main.uci, true);
  };
  /** Swipe to the left: another line (nothing recorded). */
  const skip = () => startRef.current();
  const toExplorer = () => {
    if (!line) return;
    const moves = [...(root === START_FEN ? [] : (pathTo(line.side.rep, root) ?? [])), ...line.history];
    navigate(`/explorer?${new URLSearchParams({ line: moves.map((m) => m.uci).join(','), ...(line.side.color === 'black' ? { color: 'black' } : {}) })}`);
  };

  // The answer clock (Paramètres › Temps pour répondre): time up counts as a mistake, the answer is shown.
  const clock = useAnswerClock(line?.phase === 'ask' && !line.revealed, `${line?.side.id}|${line?.history.length}|${score.lines}`, () =>
    setLine((l) => (l && l.phase === 'ask' ? { ...l, revealed: true, mistakes: l.mistakes + 1 } : l)),
  );

  const shapes = useMemo<DrawShape[]>(() => {
    if (line?.phase !== 'ask') return [];
    if (line.revealed) return answerArrows(answers);
    if (line.hinted) return answers.map((m) => ({ orig: m.uci.slice(0, 2) as Key, brush: 'repertoire' }));
    return [];
  }, [line?.phase, line?.revealed, line?.hinted, line?.fen]);

  if (!playable.length) {
    return (
      <div className="panel done">
        <h3>{t('Rien à tester pour l’instant', 'Nothing to test for now')}</h3>
        <p className="muted">
          {t(
            '« Se tester » porte sur ce que vous avez appris. Apprenez d’abord quelques positions dans « Réviser ».',
            '“Test yourself” covers what you have learnt. First learn a few positions in “Review”.',
          )}
        </p>
        {onLearn && <button className="primary" onClick={onLearn}>{t('Réviser', 'Review')}</button>}
      </div>
    );
  }

  return (
    <div className="editor">
      <div className={`editor-board${clock.paused ? ' paused' : ''}`}>
        <OpeningName ucis={line?.history.map((m) => m.uci) ?? []} />
        <Board
          fen={line?.fen ?? root ?? START_FEN}
          orientation={line?.side.color ?? playable[0]!.s.color}
          lastMove={line?.history.at(-1)?.uci}
          shapes={shapes}
          onMove={line?.phase === 'ask' && !clock.paused ? (uci) => play(uci) : undefined}
        />
        {clock.paused && (
          <button className="pause-overlay" onClick={() => clock.setPaused(false)}>
            ▶ {t('Reprendre', 'Resume')}
          </button>
        )}
        {line?.phase === 'end' && line.history.length > 0 && <LineDone text={t('Fin de ce que vous connaissez', 'End of what you know')} />}
        <AnswerTimer clock={clock} />
        {/* Same as the review under the board: the line, the swipe bar, Indice / Solution and Explorer. */}
        <QuizLine moves={line?.history ?? []} firstPly={plyOf(root)} />
        <SwipeBar onSkip={skip} label={t('changer de ligne', 'change line')} />
        <DrillActions
          hinted={!!line && (line.hinted || line.revealed)}
          disabled={line?.phase !== 'ask' || clock.paused}
          solutionTitle={t('Jouer le coup (compté comme aidé), puis la ligne continue', 'Play the move (counted as helped), then the line goes on')}
          onHint={hint}
          onExplorer={toExplorer}
        />
      </div>
    </div>
  );
}
