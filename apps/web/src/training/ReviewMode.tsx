import { groupLines, lineStarts, START_FEN, type Repertoire, type RepMove, type TrainingPosition } from '@prepa-cahier/core';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Grade } from '../api';
import { Board } from '../components/Board';
import { dayStart, useSettings } from '../settings';
import { answerArrows, inTime, JUMP_MS, REPLAY_MS, REPLAYED_PLIES, REPLY_MS } from './common';
import { outcomeOf, type Outcome } from './Feedback';
import type { Source } from './useTrainingSources';

interface Item {
  source: Source;
  target: TrainingPosition;
}

interface Question extends Item {
  /** The move asked: one of my moves to review (or to learn), at random when several are. */
  expected: RepMove;
  /** The expected move is not learnt yet: it is shown. */
  isNew: boolean;
  /** When the line continues: my last move, then the opponent's reply leading to `target`. */
  lead?: { mine: RepMove; reply: RepMove };
}

/** Why a line stops after my move: its end, the shortened lines, or a sequel already reviewed. */
type LineEnd = 'end' | 'cut' | 'done';
/** Pause on the end of a line before the next one. */
const LINE_END_MS = 1500;

const same = (a: Item, b: Item) => a.source.id === b.source.id && a.target.fen === b.target.fen;

/** Plies from `from` to the nearest position of `targets` in the repertoire (Infinity: none). */
function distanceTo(rep: Repertoire, from: string, targets: Set<string>): number {
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 0; frontier.length; d++) {
    if (frontier.some((f) => targets.has(f))) return d;
    const next: string[] = [];
    for (const f of frontier) {
      for (const m of rep.movesAt(f)) {
        if (seen.has(m.toFen)) continue;
        seen.add(m.toFen);
        next.push(m.toFen);
      }
    }
    frontier = next;
  }
  return Infinity;
}

/**
 * One of `items` at random, weighted by `chance`. Unknown chances get a small weight (2% of the
 * known total); with none known: main line 2, others 1.
 */
function weightedPick<T>(items: T[], chance: (t: T) => number | undefined, isMain: (t: T) => boolean): T {
  const known = items.map((t) => chance(t) ?? 0);
  const sum = known.reduce((a, b) => a + b, 0);
  const weights = sum > 0 ? known.map((k) => (k > 0 ? k : 0.02 * sum)) : items.map((t) => (isMain(t) ? 2 : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items.at(-1)!;
}

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
  chanceOf,
  learntElsewhere = 0,
  noNewLimit = false,
}: {
  sources: Source[];
  newPerDay: number;
  /** All unseen positions are available (e.g. training a chosen subtree). */
  noNewLimit?: boolean;
  onReview: (source: Source, fen: string, uci: string, grade: Grade) => void;
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
  /**
   * Probability of reaching a position at the user's level (whatever the learning order): picks
   * the branch followed when several continue a line equally well.
   */
  chanceOf?: (source: Source, fen: string) => number | undefined;
  /** Lines learnt today in the repertoires not in this session (the daily limit is shared). */
  learntElsewhere?: number;
}) {
  const [extraNew, setExtraNew] = useState(0);
  const [ahead, setAhead] = useState(false);
  /** Positions answered in this session (not asked again when reviewing ahead). */
  const answered = useRef(new Set<string>());
  /** Positions of the lines given up in this session (asked after the others). */
  const skipped = useRef(new Set<string>());
  const firstOf = (items: Item[]) => items.find((p) => !skipped.current.has(`${p.source.id}|${p.target.fen}`)) ?? items[0];
  /** reviewed: all answers; asked: positions already learnt; firstTry: asked and right first time. */
  const [stats, setStats] = useState({ reviewed: 0, asked: 0, firstTry: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState<Question | null>(null);
  const [round, setRound] = useState(0);
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
    const upcoming: (Item & { at: number })[] = [];
    const reach = (item: Item) => reachOf?.(item.source, item.target.fen) ?? -1;
    // Everything in lines (a review always goes through a whole line). New lines: one daily
    // limit for all repertoires, minus the lines learnt today here and elsewhere.
    // A line learnt today in several repertoires (shared moves) counts once.
    const learntStarts = new Set<string>();
    const linesBySource: Item[][][] = [];
    for (const source of sources) {
      const state = new Map(source.positions.map((p) => [p.fen, source.stateOf(p.fen, now)]));
      const today = new Set(source.positions.filter((p) => (state.get(p.fen)!.learntAt ?? 0) >= today0).map((p) => p.fen));
      for (const p of lineStarts(source.positions.filter((p) => today.has(p.fen)), (f) => today.has(f))) learntStarts.add(p.fen);
      const unseenHere: Item[] = [];
      for (const target of source.positions) {
        const { status, at } = state.get(target.fen)!;
        if (status === 'new') unseenHere.push({ source, target });
        else if (status === 'due') due.push({ source, target, at });
        else upcoming.push({ source, target, at });
      }
      // Most likely first (stable sort: the repertoire's order for equal or unknown ones).
      if (reachOf) unseenHere.sort((a, b) => reach(b) - reach(a));
      const lines = groupLines(unseenHere.map((i) => ({ ...i, fen: i.target.fen, path: i.target.path })));
      linesBySource.push(lines.map((line) => line.map(({ source, target }) => ({ source, target }))));
    }
    const learntToday = learntElsewhere + learntStarts.size;
    const remaining = noNewLimit ? Infinity : Math.max(0, newPerDay + extraNew - learntToday);
    let chosen: Item[][];
    if (reachOf) {
      // By frequency: the most likely lines first, all repertoires together.
      chosen = linesBySource.flat().sort((a, b) => reach(b[0]!) - reach(a[0]!)).slice(0, remaining);
    } else {
      // Repertoire order: one line of each repertoire in turn, so that none is left behind.
      chosen = [];
      for (let k = 0; chosen.length < remaining && linesBySource.some((l) => l.length > k); k++) {
        for (const lines of linesBySource) if (lines[k] && chosen.length < remaining) chosen.push(lines[k]!);
      }
    }
    const fresh: Item[] = chosen.flat();
    const freshLines = chosen.length;
    const unseenLines = linesBySource.reduce((n, l) => n + l.length, 0) - freshLines;
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
  }, [sources, now, newPerDay, extraNew, noNewLimit, ahead, reachOf, learntElsewhere]);

  useEffect(() => {
    onCounts({ dueLines: queue.dueLines, freshLines: queue.freshLines, ...stats });
  }, [queue.dueLines, queue.freshLines, stats, onCounts]);

  const ask = (q: Question | null) => {
    setCurrent(q);
    setRound((r) => r + 1);
  };
  /** The latest version of a source (its cards change with each answer). */
  const latest = (source: Source) => sources.find((s) => s.id === source.id) ?? source;
  const question = (item: Item, lead?: Question['lead']): Question => {
    const source = latest(item.source);
    const { fen } = item.target;
    // The moves to review (or to learn); none when finishing a line: any of them.
    const pending = source.stateOf(fen, Date.now()).pending;
    const pool = pending.length ? pending : source.rep.movesAt(fen);
    const expected = pool[Math.floor(Math.random() * pool.length)]!;
    return { source, target: item.target, expected, isNew: !source.cardOf(fen, expected.uci), lead };
  };

  // First question, and questions becoming due while idle.
  useEffect(() => {
    const first = firstOf(queue.items);
    if (!current && first && !jumpTimer.current) ask(question(first));
  }, [current, queue.items]);

  /**
   * Next question after answering: a started line is always followed to its end, even when
   * its next positions are not due (or beyond the daily limit of new ones). When the
   * opponent has several replies, the branch reaching a position to review soonest.
   */
  const nextAfter = (done: Item, played: RepMove): { next: Question | null; end?: LineEnd } => {
    const items = queue.items.filter((p) => !same(p, done));
    const { source } = done;
    const pending = new Set(items.filter((p) => p.source.id === source.id).map((p) => p.target.fen));
    const byFen = new Map(source.positions.map((t) => [t.fen, t]));
    // Opponent replies leading to a position to train, not already answered in this session
    // (unless it is waiting again in the queue).
    const options = source.rep.movesAt(played.toFen).flatMap((reply) => {
      const target = byFen.get(reply.toFen);
      if (!target || target.fen === done.target.fen) return [];
      if (!pending.has(target.fen) && answered.current.has(`${source.id}|${target.fen}`)) return [];
      return [{ reply, target, dist: distanceTo(source.rep, target.fen, pending) }];
    });
    if (options.length) {
      // The reply reaching a position to review soonest; ties: at random, weighted by the
      // probability of reaching each position in a game.
      const best = Math.min(...options.map((o) => o.dist));
      const tied = options.filter((o) => o.dist === best);
      const pick = weightedPick(tied, (o) => chanceOf?.(source, o.target.fen), (o) => !!o.reply.isMain);
      return { next: question({ source, target: pick.target }, { mine: played, reply: pick.reply }) };
    }
    // The line stops here: cut (a position of mine follows in the repertoire but is not trained),
    // or every sequel was already reviewed in this session, or its real end.
    const replies = source.rep.movesAt(played.toFen);
    const end: LineEnd = replies.some((r) => source.rep.movesAt(r.toFen).length > 0 && !byFen.has(r.toFen))
      ? 'cut'
      : replies.some((r) => byFen.has(r.toFen))
        ? 'done'
        : 'end';
    const first = firstOf(items);
    return { next: first ? question(first) : null, end };
  };

  const record = (q: Question, outcome: Outcome) => {
    const grade: Grade = outcome === 'correct' ? 'good' : 'again';
    answered.current.add(`${q.source.id}|${q.target.fen}`);
    // Bonus position (asked to finish the line, not due yet): only a mistake is recorded, so a
    // right answer leaves its schedule unchanged.
    const card = latest(q.source).cardOf(q.target.fen, q.expected.uci);
    const bonus = card !== undefined && Date.parse(card.due) > Date.now();
    if (!(bonus && outcome === 'correct')) onReview(q.source, q.target.fen, q.expected.uci, grade);
    setStats((s) => ({
      reviewed: s.reviewed + 1,
      asked: s.asked + (outcome === 'new' ? 0 : 1),
      firstTry: s.firstTry + (outcome === 'correct' ? 1 : 0),
    }));
  };

  const onAnswered = (q: Question, played: RepMove, outcome: Outcome) => {
    record(q, outcome);
    const { next, end } = nextAfter(q, played);
    if (next?.lead) return ask(next);
    jumpTimer.current = setTimeout(() => {
      jumpTimer.current = undefined;
      setNow(Date.now());
      ask(next);
    }, end ? LINE_END_MS : JUMP_MS);
  };

  /** Given up: a mistake; the rest of the line is played, then another line (not this one again). */
  const onAbandon = (q: Question, rest: RepMove[], ms: number) => {
    record(q, 'mistake');
    for (const m of rest) skipped.current.add(`${q.source.id}|${m.toFen}`);
    const items = queue.items.filter((p) => !same(p, q));
    jumpTimer.current = setTimeout(() => {
      jumpTimer.current = undefined;
      setNow(Date.now());
      const first = firstOf(items);
      ask(first ? question(first) : null);
    }, ms + LINE_END_MS);
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
      onAnswered={(played, outcome) => onAnswered(current, played, outcome)}
      onAbandon={(rest, ms) => onAbandon(current, rest, ms)}
    />
  );
}

/** Pace of the line played to its end after giving up. */
const ABANDON_MS = 350;

/**
 * The line from `move` to its end, as trained: an opponent reply only when it leads to a
 * trained position (shortened lines stop after my move, like the review), main moves first.
 */
function restOfLine(source: Source, move: RepMove): RepMove[] {
  const trained = new Set(source.positions.map((p) => p.fen));
  const main = (moves: RepMove[]) => moves.find((m) => m.isMain) ?? moves[0];
  const out = [move];
  const seen = new Set([move.toFen]);
  for (let fen = move.toFen; out.length < 80; ) {
    const reply = main(source.rep.movesAt(fen).filter((r) => trained.has(r.toFen) && !seen.has(r.toFen)));
    const mine = reply && main(source.rep.movesAt(reply.toFen));
    if (!reply || !mine || seen.has(mine.toFen)) break;
    out.push(reply, mine);
    seen.add(reply.toFen).add(mine.toFen);
    fen = mine.toFen;
  }
  return out;
}

/**
 * One question: one of my moves (`expected`). When the line continues, the board first shows
 * my previous move, then plays the opponent's reply. A new move is shown; two wrong tries or
 * the time running out reveal it. Another move of my repertoire (an alternative) is not a
 * mistake: try again. Hint: the piece to move, then the move played. Give up: the line is
 * played to its end.
 */
function Drill({
  round,
  question,
  onAnswered,
  onAbandon,
}: {
  /** Changes with each question. Not used as a React key: the board must stay mounted. */
  round: number;
  question: Question;
  onAnswered: (played: RepMove, outcome: Outcome) => void;
  /** Given up: the rest of the line is played, for `ms`. */
  onAbandon: (rest: RepMove[], ms: number) => void;
}) {
  const { answerSeconds } = useSettings();
  const navigate = useNavigate();
  const { source, target, expected, isNew, lead } = question;
  const plies = target.path.length;
  const fresh = () => ({
    round,
    replied: !lead,
    // Jump to another line: replay its last moves; following the line: no replay.
    shown: lead ? plies : Math.max(0, plies - REPLAYED_PLIES),
    mistakes: 0,
    /** Another move of my repertoire played instead of the expected one. */
    revealed: isNew,
    /** Alternatives played: each one restarts the clock. */
    retries: 0,
    /** The last alternative played (shown in a bubble). */
    alternative: null as RepMove | null,
    /** 1: the piece to move is shown. */
    hinted: false,
    played: null as RepMove | null,
    /** Given up: the rest of the line, and how much of it is on the board. */
    rest: null as RepMove[] | null,
    restShown: 0,
  });
  const [state, setState] = useState(fresh);
  // New question: reset the state during render (keeps the board mounted, no flash).
  const current = state.round === round ? state : fresh();
  if (state.round !== round) setState(current);
  const { replied, shown, mistakes, revealed, retries, alternative, hinted, played, rest, restShown } = current;
  const update = (patch: Partial<typeof current>) => setState((s) => ({ ...s, ...patch }));
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

  useEffect(() => {
    if (!rest || restShown >= rest.length) return;
    const t = setTimeout(() => update({ restShown: restShown + 1 }), restShown === 0 ? 0 : ABANDON_MS);
    return () => clearTimeout(t);
  }, [rest, restShown]);

  const asking = replied && shown >= plies && !played && !rest;
  /** The clock runs on a learnt move until it is answered, revealed or hinted. */
  const timing = asking && answerSeconds > 0 && !revealed && !hinted;

  useEffect(() => {
    if (!timing) return;
    const t = setTimeout(() => update({ revealed: true, mistakes: mistakes + 1 }), answerSeconds * 1000);
    return () => clearTimeout(t);
  }, [timing, round, retries]);

  const outcome = (helped: boolean) => outcomeOf(isNew, mistakes, revealed || helped);

  const play = (uci: string) => {
    if (!asking) return;
    if (uci !== expected.uci) {
      const other = answers.find((m) => m.uci === uci);
      if (other) {
        update({ retries: retries + 1, alternative: other });
        return 'retry';
      }
      update({ mistakes: mistakes + 1, revealed: revealed || mistakes + 1 >= 2 });
      return false;
    }
    update({ played: expected });
    // New or helped: asked again soon. Right first time: good.
    onAnswered(expected, outcome(hinted));
  };

  /** First the piece to move, then the move itself. */
  const hint = () => {
    if (!hinted && !revealed) return update({ hinted: true });
    update({ played: expected });
    onAnswered(expected, outcome(true));
  };

  const abandon = () => {
    const line = restOfLine(source, expected);
    update({ rest: line, restShown: 0 });
    onAbandon(line, line.length * ABANDON_MS);
  };

  /** The moves on the board, from the start. */
  let moves: RepMove[];
  if (rest) moves = [...target.path, ...rest.slice(0, restShown)];
  else if (played) moves = [...target.path, played];
  else if (!replied && lead) moves = target.path.slice(0, -1);
  else moves = target.path.slice(0, shown);
  const last = moves.at(-1);

  const shapes = useMemo<DrawShape[]>(() => {
    if (!asking) return [];
    if (revealed) return answerArrows([expected]);
    if (hinted) return [{ orig: expected.uci.slice(0, 2) as Key, brush: 'repertoire' }];
    return [];
  }, [revealed, hinted, asking, expected]);

  const toExplorer = () =>
    navigate(`/explorer?${new URLSearchParams({ line: moves.map((m) => m.uci).join(','), ...(source.color === 'black' ? { color: 'black' } : {}) })}`);

  return (
    <div className="editor">
      <div className="editor-board">
        <Board
          fen={last?.toFen ?? START_FEN}
          orientation={source.color}
          lastMove={last?.uci}
          shapes={shapes}
          onMove={asking ? play : undefined}
        />
        {alternative && asking && (
          <div key={retries} className="alt-bubble" role="status">
            ♻️ <strong>{alternative.san}</strong> est aussi dans ton répertoire — cherche l’autre !
          </div>
        )}
        <div className="answer-timer">
          {timing && <div key={`${round}-${retries}`} style={{ animationDuration: `${answerSeconds}s` }} />}
        </div>
        <div className="drill-actions">
          <button onClick={hint} disabled={!asking} title={hinted || revealed ? 'Jouer le coup' : 'Montrer la pièce à jouer'}>
            💡 Indice
          </button>
          <button onClick={abandon} disabled={!asking} title="Voir la ligne jusqu’à la fin">
            🏳 Abandon
          </button>
          <button onClick={toExplorer} title="Ouvrir cette position dans l’Explorer">
            🧭 Explorer
          </button>
        </div>
      </div>
    </div>
  );
}
