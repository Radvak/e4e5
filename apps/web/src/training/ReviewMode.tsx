import { groupLines, lineStarts, START_FEN, type Repertoire, type RepMove, type TrainingPosition } from '@tabiya/core';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Grade } from '../api';
import { Board } from '../components/Board';
import { OpeningName } from '../components/OpeningName';
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
const LINE_END_MS = 1100;

/** Same position (cards belong to the user: the same position in two repertoires is one question). */
const same = (a: Item, b: Item) => a.target.fen === b.target.fen;
/** Dots of the questions passed shown left of the swipe bar (then "+N"). */
const MAX_DOTS = 8;
/**
 * A position answered less than this ago waits behind the others (FSRS learning steps make it due
 * again after a minute): it is not asked twice in a row while something else is to do.
 */
const RECENT_MS = 5 * 60_000;
/**
 * A position due within this delay is reviewed with the line it continues (and the answer
 * recorded): positions answered one after the other become due again seconds apart (learning
 * steps of 1 and 10 min), and the line would otherwise stop just before the next one.
 */
const SOON_MS = 10 * 60_000;

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
  /** Positions (fen) answered in this session, and when last (not asked again when reviewing ahead). */
  const answered = useRef(new Map<string, number>());
  /** Positions of the lines given up in this session (asked after the others). */
  const skipped = useRef(new Set<string>());
  /** Questions passed with a swipe, last one last (a swipe the other way comes back to it). */
  const [passed, setPassed] = useState<Question[]>([]);
  const firstOf = (items: Item[]) => items.find((p) => !skipped.current.has(`${p.source.id}|${p.target.fen}`)) ?? items[0];
  /** reviewed: all answers; asked: positions already learnt; firstTry: asked and right first time. */
  const [stats, setStats] = useState({ reviewed: 0, asked: 0, firstTry: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState<Question | null>(null);
  const [round, setRound] = useState(0);
  const jumpTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The line just ended with the last answer (a badge until the next one). */
  const [lineDone, setLineDone] = useState(false);

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
    const early = upcoming.filter((p) => !answered.current.has(p.target.fen));
    const all: Item[] = [...due, ...fresh, ...(ahead ? early : [])];
    // Answered a moment ago: after the others (still asked when nothing else is left).
    const recent = (p: Item) => now - (answered.current.get(p.target.fen) ?? -Infinity) < RECENT_MS;
    const items = [...all.filter((p) => !recent(p)), ...all.filter(recent)];
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
    setLineDone(false);
    setCurrent(q);
    setRound((r) => r + 1);
  };
  /** The latest version of a source (its cards change with each answer). */
  const latest = (source: Source) => sources.find((s) => s.id === source.id) ?? source;
  const question = (item: Item, lead?: Question['lead']): Question => {
    const source = latest(item.source);
    const { fen } = item.target;
    // The moves to review (or to learn), else those due soon; none when finishing a line: any of them.
    const now = Date.now();
    const pending = source.stateOf(fen, now).pending;
    const soon = pending.length ? pending : source.stateOf(fen, now + SOON_MS).pending;
    const pool = soon.length ? soon : source.rep.movesAt(fen);
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
    // Due soon (learning steps): reviewed with this line rather than alone a moment later.
    const horizon = Date.now() + SOON_MS;
    for (const t of source.positions) {
      if (t.fen !== done.target.fen && source.stateOf(t.fen, horizon).status === 'due') pending.add(t.fen);
    }
    const byFen = new Map(source.positions.map((t) => [t.fen, t]));
    // Opponent replies leading to a position to train, not already answered in this session
    // (unless it is waiting again in the queue).
    const options = source.rep.movesAt(played.toFen).flatMap((reply) => {
      const target = byFen.get(reply.toFen);
      if (!target || target.fen === done.target.fen) return [];
      if (!pending.has(target.fen) && answered.current.has(target.fen)) return [];
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
    answered.current.set(q.target.fen, Date.now());
    // Answered after all (it came back in the queue): no longer waiting among the passed ones.
    setPassed((list) => (list.some((p) => same(p, q)) ? list.filter((p) => !same(p, q)) : list));
    // Bonus position (asked to finish the line, not due soon): only a mistake is recorded, so a
    // right answer leaves its schedule unchanged. Due soon: recorded, so it does not come back alone.
    const card = latest(q.source).cardOf(q.target.fen, q.expected.uci);
    const bonus = card !== undefined && Date.parse(card.due) > Date.now() + SOON_MS;
    if (!(bonus && outcome === 'correct')) onReview(q.source, q.target.fen, q.expected.uci, grade);
    setStats((s) => ({
      reviewed: s.reviewed + 1,
      asked: s.asked + (outcome === 'new' ? 0 : 1),
      firstTry: s.firstTry + (outcome === 'correct' ? 1 : 0),
    }));
  };

  /** The question waiting for the pause between two lines (a swipe asks it at once). */
  const pending = useRef<(() => void) | null>(null);
  /** Asks `next` after `ms` (or at once on a swipe). */
  const later = (next: () => Question | null, ms: number) => {
    const go = () => {
      clearTimeout(jumpTimer.current);
      jumpTimer.current = undefined;
      pending.current = null;
      setNow(Date.now());
      ask(next());
    };
    pending.current = go;
    jumpTimer.current = setTimeout(go, ms);
  };

  const onAnswered = (q: Question, played: RepMove, outcome: Outcome) => {
    record(q, outcome);
    const { next, end } = nextAfter(q, played);
    if (next?.lead) return ask(next);
    if (end) setLineDone(true);
    later(() => next, end ? LINE_END_MS : JUMP_MS);
  };

  /**
   * Swipe to the left (bar under the board): the next question now. During the pause after an answer, the one
   * waiting; while asked, this line is passed without recording anything (asked after the others).
   */
  const lineKeys = (q: Item & { expected: RepMove }) =>
    [{ toFen: q.target.fen }, ...restOfLine(q.source, q.expected)].map((m) => `${q.source.id}|${m.toFen}`);
  const onSkip = (q: Question) => {
    if (pending.current) return pending.current();
    for (const k of lineKeys(q)) skipped.current.add(k);
    setPassed((list) => [...list.filter((p) => !same(p, q)), q]);
    const items = queue.items.filter((p) => !same(p, q));
    const first = firstOf(items.filter((p) => !skipped.current.has(`${p.source.id}|${p.target.fen}`))) ?? firstOf(items);
    if (first && same(first, q)) return;
    setNow(Date.now());
    ask(first ? question(first) : null);
  };

  /** Swipe to the right: back to the last question passed (its line is no longer put aside). */
  const onBack = () => {
    const last = passed.at(-1);
    if (!last) return;
    clearTimeout(jumpTimer.current);
    jumpTimer.current = undefined;
    pending.current = null;
    for (const k of lineKeys(last)) skipped.current.delete(k);
    setPassed((list) => list.slice(0, -1));
    setNow(Date.now());
    ask(question(last));
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
      lineDone={lineDone}
      question={current}
      onAnswered={(played, outcome) => onAnswered(current, played, outcome)}
      onSkip={() => onSkip(current)}
      passed={passed.length}
      onBack={onBack}
    />
  );
}

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
 * mistake: try again. One button: the piece to move (hint), then the solution (the move is
 * played, helped, and the line goes on). Swipe to the left on the bar under the board: the
 * next question.
 */
function Drill({
  round,
  lineDone,
  question,
  onAnswered,
  onSkip,
  passed,
  onBack,
}: {
  /** Changes with each question. Not used as a React key: the board must stay mounted. */
  round: number;
  question: Question;
  onAnswered: (played: RepMove, outcome: Outcome) => void;
  /** Swipe to the left on the bar under the board: the next question. */
  onSkip: () => void;
  /** Questions passed so far (a dot each, left of the bar). */
  passed: number;
  /** Swipe to the right: back to the last question passed. */
  onBack: () => void;
  /** The line ends with the move just played (shown until the next line). */
  lineDone: boolean;
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
  });
  const [state, setState] = useState(fresh);
  // New question: reset the state during render (keeps the board mounted, no flash).
  const current = state.round === round ? state : fresh();
  if (state.round !== round) setState(current);
  const { replied, shown, mistakes, revealed, retries, alternative, hinted, played } = current;
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

  const asking = replied && shown >= plies && !played;
  /** The clock runs on a learnt move until it is answered, revealed or hinted. */
  const timing = asking && answerSeconds > 0 && !revealed && !hinted;

  /** Paused: the clock stops and the board is blurred (kept from one question to the next). */
  const [paused, setPaused] = useState(false);
  /** Time left on the clock of this question / retry (what remains after a pause). */
  const clockKey = `${round}-${retries}`;
  const left = useRef({ key: '', ms: 0 });
  if (left.current.key !== clockKey) left.current = { key: clockKey, ms: answerSeconds * 1000 };

  useEffect(() => {
    if (!timing || paused) return;
    const clock = left.current;
    const start = Date.now();
    const t = setTimeout(() => update({ revealed: true, mistakes: mistakes + 1 }), clock.ms);
    return () => {
      clearTimeout(t);
      clock.ms = Math.max(0, clock.ms - (Date.now() - start));
    };
  }, [timing, paused, clockKey]);

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

  /** One button: first the piece to move, then the solution (the move is played, helped). */
  const hint = () => {
    if (!hinted && !revealed) return update({ hinted: true });
    update({ played: expected });
    onAnswered(expected, outcome(true));
  };

  /**
   * Swipe to the left on the bar under the board (like Android's gesture bar): its handle follows
   * the finger, and past a threshold the next question comes. The board keeps its gestures.
   */
  const handle = useRef<HTMLSpanElement>(null);
  const swipe = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const slide = (dx: number) => {
    const el = handle.current;
    if (!el) return;
    el.style.transition = dx ? 'none' : 'transform 0.15s';
    el.style.transform = dx ? `translateX(${dx}px)` : '';
  };
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    swipe.current = t && e.touches.length === 1 && !paused ? { x: t.clientX, y: t.clientY, axis: null } : null;
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipe.current;
    const t = e.touches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    // To the left: pass; to the right: back to a question passed (if any, else it gives a little).
    if (s.axis === 'x') slide(dx < 0 || passed > 0 ? dx : dx / 6);
  };
  const endSwipe = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    slide(0);
    const t = e.changedTouches[0];
    if (!s || !t || s.axis !== 'x' || e.type === 'touchcancel') return;
    const dx = t.clientX - s.x;
    const threshold = Math.max(50, e.currentTarget.getBoundingClientRect().width * 0.25);
    if (-dx > threshold) onSkip();
    else if (dx > threshold && passed > 0) onBack();
  };

  /** The moves on the board, from the start. */
  let moves: RepMove[];
  if (played) moves = [...target.path, played];
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
      <div className={`editor-board${paused ? ' paused' : ''}`}>
        <OpeningName ucis={moves.map((m) => m.uci)} />
        <Board
          fen={last?.toFen ?? START_FEN}
          orientation={source.color}
          lastMove={last?.uci}
          shapes={shapes}
          onMove={asking && !paused ? play : undefined}
        />
        {paused && (
          <button className="pause-overlay" onClick={() => setPaused(false)}>
            ▶ Reprendre
          </button>
        )}
        {lineDone && played && (
          <div className="line-done" role="status">
            <svg viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="23" />
              <path d="M15 27l7 7 15-16" />
            </svg>
            <span>Ligne revue</span>
          </div>
        )}
        {alternative && asking && (
          <div key={retries} className="alt-bubble" role="status">
            ♻️ <strong>{alternative.san}</strong> est aussi dans ton répertoire — cherche l’autre !
          </div>
        )}
        <div className="timer-row">
          <div className="answer-timer">
            {timing && (
              <div key={clockKey} style={{ animationDuration: `${answerSeconds}s`, animationPlayState: paused ? 'paused' : 'running' }} />
            )}
          </div>
          <button
            className="pause-btn"
            onClick={() => setPaused(!paused)}
            title={paused ? 'Reprendre' : 'Pause (cache l’échiquier)'}
            aria-label={paused ? 'Reprendre' : 'Pause'}
          >
            {paused ? '▶' : '❚❚'}
          </button>
        </div>
        <div className="drill-actions">
          <button onClick={hint} disabled={!asking || paused} title={hinted || revealed ? 'Jouer le coup attendu (compté comme aidé), puis la ligne continue' : 'Montrer la pièce à jouer'}>
            {hinted || revealed ? '🏳 Solution' : '💡 Indice'}
          </button>
          <button onClick={toExplorer} title="Ouvrir cette position dans l’Explorer">
            🧭 Explorer
          </button>
        </div>
        <div
          className="swipe-bar"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={endSwipe}
          onTouchCancel={endSwipe}
          title={passed ? `Balayez vers la gauche pour passer, vers la droite pour revenir (${passed} passée${passed > 1 ? 's' : ''})` : 'Balayez vers la gauche pour passer à la suite'}
        >
          {passed > 0 && (
            <span className="swipe-passed" aria-label={`${passed} question${passed > 1 ? 's' : ''} passée${passed > 1 ? 's' : ''}`}>
              {Array.from({ length: Math.min(passed, MAX_DOTS) }, (_, i) => <span key={i} className="dot-passed" />)}
              {passed > MAX_DOTS && <span className="more">+{passed - MAX_DOTS}</span>}
            </span>
          )}
          <span ref={handle} className="swipe-handle" aria-hidden="true" />
          <span className="swipe-label muted">{passed ? '← passer · revenir →' : '← balayez pour passer'}</span>
        </div>
      </div>
    </div>
  );
}
