/**
 * Games of the Lichess game database (https://database.lichess.org): a monthly file streamed
 * (downloaded by curl, decompressed by zstd on the fly, nothing written to disk), read game by
 * game for the statistics builder (build.ts).
 */
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { RATING_BUCKETS } from '@tabiya/core';

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

const SPACE = (c: number) => c === 32 || c === 10 || c === 13 || c === 9;
const RESULTS = new Set(['*', '1-0', '0-1', '1/2-1/2']);

/**
 * SAN moves of a movetext: comments ({[%clk …]}), variations, numbers, annotations and result
 * left out. Scanned character by character and stopped after `max` moves: the games are long and
 * only their opening is used (this is most of the time of a statistics build).
 */
export function sanMoves(movetext: string, max: number): string[] {
  const out: string[] = [];
  const n = movetext.length;
  let i = 0;
  while (i < n && out.length < max) {
    const c = movetext.charCodeAt(i);
    if (SPACE(c)) {
      i++;
    } else if (c === 123) {
      // { comment }
      const end = movetext.indexOf('}', i + 1);
      i = end < 0 ? n : end + 1;
    } else if (c === 40) {
      // ( variation ), nested, possibly with comments
      let depth = 1;
      for (i++; i < n && depth; i++) {
        const d = movetext.charCodeAt(i);
        if (d === 40) depth++;
        else if (d === 41) depth--;
        else if (d === 123) {
          const end = movetext.indexOf('}', i + 1);
          i = end < 0 ? n : end;
        }
      }
    } else {
      let j = i + 1;
      while (j < n) {
        const d = movetext.charCodeAt(j);
        if (SPACE(d) || d === 123 || d === 40) break;
        j++;
      }
      let start = i;
      let end = j;
      i = j;
      // A move number ("12." or "12..."), possibly glued to the move.
      let k = start;
      while (k < end && movetext.charCodeAt(k) >= 48 && movetext.charCodeAt(k) <= 57) k++;
      if (k > start && k < end && movetext.charCodeAt(k) === 46) {
        while (k < end && movetext.charCodeAt(k) === 46) k++;
        start = k;
      }
      // Annotations (!, ?, !?, …).
      while (end > start && (movetext.charCodeAt(end - 1) === 33 || movetext.charCodeAt(end - 1) === 63)) end--;
      if (end === start || movetext.charCodeAt(start) === 36) continue; // empty, $1 (NAG)
      const t = movetext.slice(start, end);
      if (!RESULTS.has(t)) out.push(t);
    }
  }
  return out;
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

/**
 * A game database as a stream of bytes (URL or file, zstd-compressed or not). A URL is
 * downloaded by `curl`: much faster than Node's fetch for these files (measured on GitHub
 * Actions: the build read 4 times fewer games per second through fetch).
 */
function open(source: string, signal: AbortSignal): Readable {
  let input: Readable;
  if (/^https?:/.test(source)) {
    const child = spawn('curl', ['-sSfL', '--retry', '5', source], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => child.stdout.destroy(e));
    child.on('close', (code) => {
      if (code && !signal.aborted) child.stdout.destroy(new Error(`${source} : curl ${stderr.trim() || `code ${code}`}`));
    });
    signal.addEventListener('abort', () => child.kill());
    input = child.stdout;
  } else {
    if (!existsSync(source)) throw new Error(`Fichier introuvable : ${source}`);
    input = createReadStream(source, { highWaterMark: 1 << 20 });
  }
  const stream = source.endsWith('.zst') ? unzstd(input, signal) : input;
  signal.addEventListener('abort', () => stream.destroy());
  return stream;
}

/** Value of a header line `[Name "value"]` starting with `prefix` (`[Name "`). */
const headerValue = (line: string, prefix: string) => line.slice(prefix.length, line.lastIndexOf('"'));

/**
 * Reads games of `source` into `agg` until `maxGames` are kept. Returns games read and kept.
 * The lines are cut chunk by chunk, synchronously (a promise per line was a large part of the
 * time); only the headers used are read.
 */
export async function readGames(
  source: string,
  agg: GameSink,
  maxGames: number,
  progress: (read: number, kept: number) => void,
): Promise<{ read: number; kept: number }> {
  const abort = new AbortController();
  let read = 0;
  let kept = 0;
  let inGame = false;
  let timeControl = '';
  let whiteElo = 0;
  let blackElo = 0;
  let result = '';
  const counted = (added: boolean): boolean => {
    if (added) kept++;
    if (read % 100_000 === 0) progress(read, kept);
    return kept >= maxGames;
  };
  /**
   * One line; true when enough games are kept. Synchronous unless the sink is (a promise only
   * then: one per line was a large part of the time).
   */
  const line = (text: string): boolean | Promise<boolean> => {
    if (text.charCodeAt(0) === 91) {
      // [Header "value"]
      inGame = true;
      if (text.startsWith('[TimeControl "')) timeControl = headerValue(text, '[TimeControl "');
      else if (text.startsWith('[WhiteElo "')) whiteElo = Number(headerValue(text, '[WhiteElo "')) || 0;
      else if (text.startsWith('[BlackElo "')) blackElo = Number(headerValue(text, '[BlackElo "')) || 0;
      else if (text.startsWith('[Result "')) result = headerValue(text, '[Result "');
      return false;
    }
    if (!inGame || !text.trim()) return false;
    // Movetext (one line in the Lichess files).
    read++;
    const added = agg.add({ timeControl, whiteElo, blackElo, result, movetext: text });
    inGame = false;
    timeControl = '';
    whiteElo = 0;
    blackElo = 0;
    result = '';
    return typeof added === 'boolean' ? counted(added) : added.then(counted);
  };
  const stream = open(source, abort.signal);
  let rest = '';
  try {
    outer: for await (const chunk of stream) {
      const text = rest + (chunk as Buffer).toString('utf8');
      let start = 0;
      for (let nl = text.indexOf('\n'); nl >= 0; nl = text.indexOf('\n', start)) {
        const l = text.slice(start, nl);
        start = nl + 1;
        const done = line(l);
        if (done === true || (done !== false && (await done))) {
          abort.abort();
          break outer;
        }
      }
      rest = text.slice(start);
    }
    if (rest && !abort.signal.aborted) await line(rest);
  } catch (e) {
    if (!abort.signal.aborted) throw e;
  }
  progress(read, kept);
  return { read, kept };
}
