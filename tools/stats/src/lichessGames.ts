/**
 * Position statistics from the Lichess game database (https://database.lichess.org): the
 * monthly files are streamed (zstd, decompressed on the fly, nothing written to disk) and the
 * moves played are counted in the positions of your repertoires, in the format of the Lichess
 * opening explorer. Tabiya serves them until Lichess answers for the position (a sample's counts
 * are far below the explorer's, see getStats in the server).
 */
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { playSanOn, positionFromFen, RATING_BUCKETS, START_FEN } from '@tabiya/core';

export interface ExplorerData {
  white: number;
  draws: number;
  black: number;
  moves: { uci: string; san: string; white: number; draws: number; black: number }[];
  opening: null;
}

export interface StatsEntry {
  fen: string;
  speeds: string[];
  ratings: number[];
  fetchedAt: number;
  data: ExplorerData;
}

/** Lichess speed of a "base+increment" time control (estimated duration base + 40 × increment). */
export function speedOf(timeControl: string): string | null {
  const m = /^(\d+)\+(\d+)$/.exec(timeControl);
  if (!m) return null; // correspondence ("-")
  const t = Number(m[1]) + 40 * Number(m[2]);
  return t < 30 ? 'ultraBullet' : t < 180 ? 'bullet' : t < 480 ? 'blitz' : t < 1500 ? 'rapid' : 'classical';
}

/** Explorer rating bucket of a game: the average of both ratings (1600 = 1600-1799, …). */
export function bucketOf(white: number, black: number): number {
  const avg = (white + black) / 2;
  let b: number = RATING_BUCKETS[0];
  for (const x of RATING_BUCKETS) if (avg >= x) b = x;
  return b;
}

/** SAN moves of a movetext: comments ({[%clk …]}), variations, numbers and result removed. */
export function sanMoves(movetext: string, max: number): string[] {
  const text = movetext.replace(/\{[^}]*\}/g, ' ').replace(/\([^()]*\)/g, ' ');
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    if (out.length >= max) break;
    const t = raw.replace(/^\d+\.+/, '').replace(/[?!]+$/, '');
    if (!t || t.startsWith('$') || t === '*' || t === '1-0' || t === '0-1' || t === '1/2-1/2') continue;
    out.push(t);
  }
  return out;
}

type Result = 'white' | 'draws' | 'black';
const RESULT: Record<string, Result> = { '1-0': 'white', '0-1': 'black', '1/2-1/2': 'draws' };

interface Counts {
  white: number;
  draws: number;
  black: number;
}
interface MoveCounts extends Counts {
  uci: string;
}

/** One position of the repertoires, its known continuations (trie of the games played). */
interface PosNode {
  fen: string;
  /** SAN -> next position (null: leaves the repertoires, not followed). */
  next: Map<string, { uci: string; node: PosNode | null } | null>;
  /** "speed|bucket" -> totals and moves. */
  counts: Map<string, { total: Counts; moves: Map<string, MoveCounts> }>;
}

/** A game of the database: the headers used and its movetext. */
export interface Game {
  timeControl: string;
  whiteElo: number;
  blackElo: number;
  result: string;
  movetext: string;
}

/** What `readGames` feeds: true when the game was kept. */
export interface GameSink {
  add(game: Game): boolean | Promise<boolean>;
}

export interface Aggregator extends GameSink {
  /** Counts a game; false if it was not kept (speed, rating). */
  add(game: Game): boolean;
  entries(combos: { speeds: string[]; ratings: number[] }[], fetchedAt: number): StatsEntry[];
  positions(): number;
}

const wantedKeys = (combos: { speeds: string[]; ratings: number[] }[]) =>
  new Set(combos.flatMap((c) => c.speeds.flatMap((s) => c.ratings.map((r) => `${s}|${r}`))));

/** "speed|bucket" of a game if it is one of `wanted` (and has a result), else null. */
function keyOf(game: Game, wanted: Set<string>): string | null {
  const speed = speedOf(game.timeControl);
  if (!speed || !RESULT[game.result] || !game.whiteElo || !game.blackElo) return null;
  const key = `${speed}|${bucketOf(game.whiteElo, game.blackElo)}`;
  return wanted.has(key) ? key : null;
}

/**
 * Rolling hash of the moves played so far (two 32-bit FNV-1a), the key of a move sequence in
 * `PrefixCounter`.
 */
function nextHash(h: [number, number], san: string): [number, number] {
  let a = h[0];
  let b = h[1];
  for (let i = 0; i < san.length; i++) {
    const c = san.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822519);
  }
  a = Math.imul(a ^ 32, 16777619); // separator
  b = Math.imul(b ^ 32, 2246822519);
  return [a >>> 0, b >>> 0];
}
const HASH_START: [number, number] = [2166136261, 3735928559];

/** First pass of `--explore`: how many kept games start with each move sequence (approximate). */
export interface PrefixCounter extends GameSink {
  /** Games starting with these moves (count-min sketch: never less than the real number). */
  count(h: [number, number]): number;
}

/**
 * Counts the move sequences (prefixes, up to `maxPlies` moves) of the kept games in a count-min
 * sketch (fixed memory, ~128 MB): a sequence played in N games is counted N or a bit more.
 */
export function prefixCounter(combos: { speeds: string[]; ratings: number[] }[], maxPlies: number): PrefixCounter {
  const wanted = wantedKeys(combos);
  const ROWS = 4;
  const BITS = 23;
  const mask = (1 << BITS) - 1;
  const table = new Uint32Array(ROWS << BITS);
  const cells = (h: [number, number]) => Array.from({ length: ROWS }, (_, r) => (r << BITS) | ((h[0] + Math.imul(r, h[1])) & mask));
  return {
    add(game) {
      if (!keyOf(game, wanted)) return false;
      let h = HASH_START;
      for (const san of sanMoves(game.movetext, maxPlies)) {
        h = nextHash(h, san);
        // Conservative update: only the smallest cells grow (less overestimation).
        const cs = cells(h);
        const min = Math.min(...cs.map((c) => table[c]!));
        for (const c of cs) if (table[c] === min) table[c] = min + 1;
      }
      return true;
    },
    count: (h) => Math.min(...cells(h).map((c) => table[c]!)),
  };
}

/**
 * Counts games in the positions of `fens` (a game is followed while it stays in them, up to
 * `maxPlies` moves). Only speeds and buckets used by `combos` are kept. With `explore`, a game
 * is also followed into the positions reached by a move sequence played in at least
 * `explore.minGames` games (`explore.prefixes`, the first pass): the positions the search at the
 * user's level needs around the repertoires. Such positions are only kept when they have at
 * least `minGames` games themselves.
 */
export function aggregator(
  fens: Set<string>,
  combos: { speeds: string[]; ratings: number[] }[],
  maxPlies: number,
  explore?: { prefixes: PrefixCounter; minGames: number },
): Aggregator {
  const wanted = wantedKeys(combos);
  const nodes = new Map<string, PosNode>();
  const nodeOf = (fen: string) => {
    let n = nodes.get(fen);
    if (!n) nodes.set(fen, (n = { fen, next: new Map(), counts: new Map() }));
    return n;
  };
  const root = nodeOf(START_FEN);

  return {
    add(game) {
      const key = keyOf(game, wanted);
      if (!key) return false;
      const result = RESULT[game.result]!;
      let node: PosNode = root;
      let h = HASH_START;
      for (const san of sanMoves(game.movetext, maxPlies)) {
        if (explore) h = nextHash(h, san);
        let step = node.next.get(san);
        if (step === undefined) {
          const played = playSanOn(positionFromFen(node.fen), san);
          const follow = !!played && (fens.has(played.toFen) || (!!explore && explore.prefixes.count(h) >= explore.minGames));
          step = played ? { uci: played.uci, node: follow ? nodeOf(played.toFen) : null } : null;
          // A dead end depends on the move sequence when exploring (another one may be frequent):
          // not remembered then. A position followed once is followed by every game.
          if (step?.node || step === null || !explore) node.next.set(san, step);
        }
        if (!step) break; // illegal (should not happen)
        let c = node.counts.get(key);
        if (!c) node.counts.set(key, (c = { total: { white: 0, draws: 0, black: 0 }, moves: new Map() }));
        c.total[result]++;
        let m = c.moves.get(san);
        if (!m) c.moves.set(san, (m = { uci: step.uci, white: 0, draws: 0, black: 0 }));
        m[result]++;
        if (!step.node) break;
        node = step.node;
      }
      return true;
    },

    entries(combos, fetchedAt) {
      const out: StatsEntry[] = [];
      for (const node of nodes.values()) {
        for (const combo of combos) {
          const total = { white: 0, draws: 0, black: 0 };
          const moves = new Map<string, MoveCounts & { san: string }>();
          for (const s of combo.speeds) {
            for (const r of combo.ratings) {
              const c = node.counts.get(`${s}|${r}`);
              if (!c) continue;
              total.white += c.total.white;
              total.draws += c.total.draws;
              total.black += c.total.black;
              for (const [san, m] of c.moves) {
                const t = moves.get(san) ?? { san, uci: m.uci, white: 0, draws: 0, black: 0 };
                t.white += m.white;
                t.draws += m.draws;
                t.black += m.black;
                moves.set(san, t);
              }
            }
          }
          if (!total.white && !total.draws && !total.black) continue;
          // Explored positions (outside the repertoires): only with enough games to be useful.
          if (explore && !fens.has(node.fen) && node !== root && total.white + total.draws + total.black < explore.minGames) continue;
          const games = (m: Counts) => m.white + m.draws + m.black;
          out.push({
            fen: node.fen,
            speeds: combo.speeds,
            ratings: [...combo.ratings].sort((a, b) => a - b),
            fetchedAt,
            data: {
              ...total,
              moves: [...moves.values()]
                .sort((a, b) => games(b) - games(a))
                .slice(0, 30)
                .map(({ uci, san, white, draws, black }) => ({ uci, san, white, draws, black })),
              opening: null,
            },
          });
        }
      }
      return out;
    },

    positions: () => nodes.size,
  };
}

/** The file of a month ("2026-10") on database.lichess.org, or a local .pgn / .pgn.zst file. */
export function monthUrl(month: string): string {
  if (/^\d{4}-\d{2}$/.test(month)) return `https://database.lichess.org/standard/lichess_db_standard_rated_${month}.pgn.zst`;
  return month;
}

/**
 * Last instant of a month ("2026-10" -> 2026-11-01T00:00Z), the date of its statistics. A file
 * path is dated by the month in its name (lichess-2026-10-….pgn.zst), else now.
 */
export function monthEnd(month: string): number {
  const m = /(20\d{2})-(0[1-9]|1[0-2])(?!\d)/.exec(month);
  return m ? Date.UTC(Number(m[1]), Number(m[2]), 1) : Date.now();
}

/**
 * zstd decompression with the `zstd` command: the Lichess dumps are made of many frames (and
 * skippable frames), and Node's built-in decompressor silently stops after the first one.
 */
function unzstd(input: Readable, signal: AbortSignal): Readable {
  const child = spawn('zstd', ['-dc', '--long=31'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  child.on('error', (e) => {
    const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
    child.stdout.destroy(new Error(missing ? 'commande zstd introuvable : sudo apt install zstd (ou brew install zstd)' : e.message));
  });
  child.on('close', (code) => {
    if (code && !signal.aborted) child.stdout.destroy(new Error(`zstd : ${stderr.trim() || `code ${code}`}`));
  });
  input.on('error', (e) => child.stdout.destroy(e));
  child.stdin.on('error', () => {}); // closed early (enough games read)
  input.pipe(child.stdin);
  signal.addEventListener('abort', () => {
    input.destroy();
    child.kill();
  });
  return child.stdout;
}

/** Lines of a game database (URL or file, zstd-compressed or not). */
async function* lines(source: string, signal: AbortSignal): AsyncGenerator<string> {
  let input: Readable;
  if (/^https?:/.test(source)) {
    const res = await fetch(source, { signal });
    if (!res.ok || !res.body) throw new Error(`${source} : HTTP ${res.status}`);
    input = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  } else {
    if (!existsSync(source)) throw new Error(`Fichier introuvable : ${source}`);
    input = createReadStream(source);
  }
  const stream = source.endsWith('.zst') ? unzstd(input, signal) : input;
  signal.addEventListener('abort', () => stream.destroy());
  let rest = '';
  try {
    for await (const chunk of stream) {
      const text = rest + (chunk as Buffer).toString('utf8');
      const parts = text.split('\n');
      rest = parts.pop()!;
      yield* parts;
    }
  } catch (e) {
    if (!signal.aborted) throw e;
  }
  if (rest) yield rest;
}

/** Reads games of `source` into `agg` until `maxGames` are kept. Returns games read and kept. */
export async function readGames(
  source: string,
  agg: GameSink,
  maxGames: number,
  progress: (read: number, kept: number) => void,
): Promise<{ read: number; kept: number }> {
  const abort = new AbortController();
  let read = 0;
  let kept = 0;
  let headers: Record<string, string> = {};
  for await (const line of lines(source, abort.signal)) {
    if (line.startsWith('[')) {
      const m = /^\[(\w+) "(.*)"\]$/.exec(line);
      if (m) headers[m[1]!] = m[2]!;
      continue;
    }
    if (!line.trim() || !Object.keys(headers).length) continue;
    // Movetext (one line in the Lichess files).
    read++;
    if (
      await agg.add({
        timeControl: headers.TimeControl ?? '',
        whiteElo: Number(headers.WhiteElo) || 0,
        blackElo: Number(headers.BlackElo) || 0,
        result: headers.Result ?? '',
        movetext: line,
      })
    )
      kept++;
    headers = {};
    if (read % 100_000 === 0) progress(read, kept);
    if (kept >= maxGames) {
      abort.abort();
      break;
    }
  }
  progress(read, kept);
  return { read, kept };
}

/**
 * Writes the games of some speeds and rating buckets into a small .pgn.zst file, cut to
 * `maxPlies` moves with only the headers `stats` reads: a month of Lichess (~30 GB) becomes a
 * file that fits in git (LFS), read later with `stats --month <file>`.
 */
export function extractor(file: string, speeds: string[], ratings: number[], maxPlies: number): GameSink & { close(): Promise<void> } {
  const wantedSpeeds = new Set(speeds);
  const wantedBuckets = new Set(ratings);
  mkdirSync(dirname(file), { recursive: true });
  const child = spawn('zstd', ['-q', '-f', '-15', '-T0', '--long=27', '-o', file], { stdio: ['pipe', 'inherit', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  const exited = new Promise<void>((resolve, reject) => {
    child.on('error', (e) =>
      reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new Error('commande zstd introuvable : sudo apt install zstd (ou brew install zstd)') : e),
    );
    child.on('close', (code) => (code ? reject(new Error(`zstd : ${stderr.trim() || `code ${code}`}`)) : resolve()));
  });
  exited.catch(() => {}); // reported by close()
  let buffer = '';
  const flush = async () => {
    if (!buffer) return;
    const ok = child.stdin.write(buffer);
    buffer = '';
    if (!ok) await Promise.race([once(child.stdin, 'drain'), exited]);
  };
  return {
    async add(g) {
      const speed = speedOf(g.timeControl);
      if (!speed || !wantedSpeeds.has(speed) || !RESULT[g.result] || !g.whiteElo || !g.blackElo) return false;
      if (!wantedBuckets.has(bucketOf(g.whiteElo, g.blackElo))) return false;
      const sans = sanMoves(g.movetext, maxPlies);
      if (!sans.length) return false;
      const moves = sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
      buffer += `[TimeControl "${g.timeControl}"]\n[WhiteElo "${g.whiteElo}"]\n[BlackElo "${g.blackElo}"]\n[Result "${g.result}"]\n\n${moves} ${g.result}\n\n`;
      if (buffer.length > 1 << 20) await flush();
      return true;
    },
    async close() {
      await flush();
      child.stdin.end();
      await exited;
    },
  };
}
