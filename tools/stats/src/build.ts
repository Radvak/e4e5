/**
 * Builds the position statistics of database.lichess.org months into a SQLite file (stats.db):
 * one row per position played in at least `--min` games (every speed and level together), keyed
 * by its Zobrist key, with its games and moves counted per speed and rating bucket (statsCodec).
 *
 *   pnpm --filter stats build-stats <AAAA-MM | file.pgn[.zst]>... --out stats.db [--min 50] [--gate 20]
 *                         [--plies 30] [--max-games N]
 *
 * Two passes over the games (a month is read twice, nothing is written to disk):
 * 1. Which positions are frequent: games are counted per position. A position is only followed
 *    once the one before it has `--gate` games (a position cannot be reached more often than the
 *    positions leading to it), so the counts of this pass miss a few games: they only choose the
 *    positions, a position with between `--min` and `--min` + `--gate` games may be missed.
 * 2. The statistics of the positions chosen, counted exactly: every game reaching them, every
 *    move played there. A game is followed while it stays in the chosen positions.
 *
 * The moves of a game are SAN: the position after a move needs the move to be played on a board,
 * which is slow (~15 µs). Each transition (position, SAN) is played once and remembered.
 * Everything lives in fixed-size typed tables; progress and the summary (JSON) are printed line
 * by line.
 */
import { statSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import {
  cellOf,
  cellsOf,
  decodePositionStats,
  encodeMove,
  encodePositionStats,
  playSanOn,
  playUci,
  positionFromFen,
  START_FEN,
  zobristHalves,
  zobristOfFen,
  type CellCounts,
} from '@e4e5/core';
import { bucketOf, monthEnd, monthUrl, readGames, sanMoves, speedOf } from './lichessGames.js';

type Position = ReturnType<typeof positionFromFen>;

const { values: opts, positionals: months } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    min: { type: 'string', default: '50' },
    gate: { type: 'string', default: '20' },
    plies: { type: 'string', default: '30' },
    'max-games': { type: 'string' },
    'max-moves': { type: 'string', default: '30' },
    'node-log2': { type: 'string', default: '25' },
    'trans-log2': { type: 'string', default: '26' },
    'stats-log2': { type: 'string', default: '27' },
  },
});
if (!months.length || !opts.out) {
  console.error('Usage: pnpm --filter stats build-stats <AAAA-MM | fichier>... --out stats.db [--min 50] [--gate 20]');
  process.exit(1);
}
const OUT = opts.out;
const MIN = Number(opts.min);
const GATE = Number(opts.gate);
const PLIES = Number(opts.plies);
const MAX_GAMES = opts['max-games'] ? Number(opts['max-games']) : Infinity;
const MAX_MOVES = Number(opts['max-moves']);

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
const mem = () => `${Math.round(process.memoryUsage().rss / 2 ** 20)} Mo`;
const fmt = (n: number) => n.toLocaleString('fr-FR');

// --- Positions: Zobrist key -> index; per index: key, games (pass 1), FEN, chosen. -------------
const NODE_SLOTS = 2 ** Number(opts['node-log2']);
const nodeMask = NODE_SLOTS - 1;
const MAX_NODES = Math.floor(NODE_SLOTS * 0.85);
const slotHi = new Uint32Array(NODE_SLOTS);
const slotLo = new Uint32Array(NODE_SLOTS);
const slotNode = new Int32Array(NODE_SLOTS).fill(-1);
const keyHi = new Uint32Array(MAX_NODES);
const keyLo = new Uint32Array(MAX_NODES);
const games = new Uint32Array(MAX_NODES);
const chosen = new Uint8Array(MAX_NODES);
const fens: string[] = [];
let nodes = 0;
let nodesFull = false;

function nodeSlot(hi: number, lo: number): number {
  let i = lo & nodeMask; // Zobrist keys are random already
  while (slotNode[i] !== -1 && (slotHi[i] !== hi || slotLo[i] !== lo)) i = (i + 1) & nodeMask;
  return i;
}
/** Index of the position (hi, lo); created when `fen` is given, else -1 if unknown. */
function nodeOf(hi: number, lo: number, fen?: string): number {
  const s = nodeSlot(hi, lo);
  if (slotNode[s] !== -1) return slotNode[s]!;
  if (fen === undefined) return -1;
  if (nodes >= MAX_NODES) {
    nodesFull = true;
    return -1;
  }
  const n = nodes++;
  slotNode[s] = n;
  slotHi[s] = hi;
  slotLo[s] = lo;
  keyHi[n] = hi;
  keyLo[n] = lo;
  fens[n] = fen;
  return n;
}
const ROOT = (() => {
  const [hi, lo] = zobristHalves(positionFromFen(START_FEN));
  return nodeOf(hi, lo, START_FEN);
})();

// --- Transitions: (position, SAN) -> next position and move. ---------------------------------
const TRANS_SLOTS = 2 ** Number(opts['trans-log2']);
const transMask = TRANS_SLOTS - 1;
const MAX_TRANS = Math.floor(TRANS_SLOTS * 0.85);
const tFrom = new Int32Array(TRANS_SLOTS).fill(-1);
const tSan = new Uint32Array(TRANS_SLOTS);
/** Next position: index, UNKNOWN (not a position of the table), ILLEGAL. */
const tTo = new Int32Array(TRANS_SLOTS);
const tMove = new Uint16Array(TRANS_SLOTS);
const UNKNOWN = -2;
const ILLEGAL = -3;
let transitions = 0;
let transFull = false;

function sanHash(san: string): number {
  let h = 2166136261;
  for (let i = 0; i < san.length; i++) h = Math.imul(h ^ san.charCodeAt(i), 16777619);
  return h >>> 0;
}
function transSlot(from: number, san: number): number {
  let i = (Math.imul(from, 0x9e3779b1) ^ Math.imul(san, 0x85ebca6b)) & transMask;
  while (tFrom[i] !== -1 && (tFrom[i] !== from || tSan[i] !== san)) i = (i + 1) & transMask;
  return i;
}

/**
 * Plays `san` from position `from` (its board `pos`, played on in place) and remembers the
 * transition. `create`: positions not in the table yet are added (pass 1). Returns the next
 * position (or UNKNOWN / ILLEGAL) and the move.
 */
function play(from: number, slot: number, h: number, pos: Position, san: string, create: boolean): { to: number; move: number } {
  const played = playSanOn(pos, san);
  let to = ILLEGAL;
  let move = 0;
  if (played) {
    move = encodeMove(played.uci);
    const [hi, lo] = zobristHalves(pos);
    to = nodeOf(hi, lo, create ? played.toFen : undefined);
    if (to < 0) to = UNKNOWN;
  }
  if (transitions < MAX_TRANS && !(create && to === UNKNOWN)) {
    tFrom[slot] = from;
    tSan[slot] = h;
    tTo[slot] = to;
    tMove[slot] = move;
    transitions++;
  } else if (transitions >= MAX_TRANS) transFull = true;
  return { to, move };
}

// --- Statistics: (position, move | TOTAL, cell) -> white, draws, black. -----------------------
const STATS_SLOTS = 2 ** Number(opts['stats-log2']);
const statsMask = STATS_SLOTS - 1;
const MAX_STATS = Math.floor(STATS_SLOTS * 0.85);
const sNode = new Int32Array(STATS_SLOTS).fill(-1);
const sKey = new Uint32Array(STATS_SLOTS);
const sCount = new Uint32Array(3 * STATS_SLOTS);
const TOTAL = 0x7fff;
let statsUsed = 0;
let statsFull = false;

function addStat(node: number, move: number, cell: number, result: number) {
  const key = (move << 6) | cell;
  let i = (Math.imul(node, 0x9e3779b1) ^ Math.imul(key, 0x85ebca6b)) & statsMask;
  while (sNode[i] !== -1 && (sNode[i] !== node || sKey[i] !== key)) i = (i + 1) & statsMask;
  if (sNode[i] === -1) {
    if (statsUsed >= MAX_STATS) {
      statsFull = true;
      return;
    }
    sNode[i] = node;
    sKey[i] = key;
    statsUsed++;
  }
  sCount[3 * i + result]!++;
}

// --- The games. -------------------------------------------------------------------------------
const RESULTS: Record<string, number> = { '1-0': 0, '1/2-1/2': 1, '0-1': 2 };

/** Pass 1: games per position, a position followed once the one before has GATE games. */
function countGame(sans: string[]) {
  let node = ROOT;
  let pos: Position | null = null; // board of `node`, made on a cache miss only
  games[ROOT]!++;
  for (const san of sans) {
    const h = sanHash(san);
    const slot = transSlot(node, h);
    let to: number;
    if (tFrom[slot] === -1) {
      if (games[node]! < GATE) return;
      pos ??= positionFromFen(fens[node]!);
      to = play(node, slot, h, pos, san, true).to; // pos is now the board of `to`
    } else {
      to = tTo[slot]!;
      pos = null;
    }
    if (to < 0) return;
    node = to;
    games[node]!++;
  }
}

/** Pass 2: statistics of the chosen positions, followed while the game stays in them. */
function statGame(sans: string[], cell: number, result: number) {
  let node = ROOT;
  let pos: Position | null = null;
  addStat(node, TOTAL, cell, result);
  for (const san of sans) {
    const h = sanHash(san);
    const slot = transSlot(node, h);
    let to: number;
    let move: number;
    if (tFrom[slot] === -1) {
      pos ??= positionFromFen(fens[node]!);
      ({ to, move } = play(node, slot, h, pos, san, false));
    } else {
      to = tTo[slot]!;
      move = tMove[slot]!;
      pos = null;
    }
    if (to === ILLEGAL) return;
    addStat(node, move, cell, result);
    if (to < 0 || !chosen[to]) return;
    node = to;
    addStat(node, TOTAL, cell, result);
  }
}

async function pass(name: string, onGame: (sans: string[], cell: number, result: number) => void): Promise<number> {
  let kept = 0;
  for (const month of months) {
    if (kept >= MAX_GAMES) break;
    const started = Date.now();
    log(`${name} : ${monthUrl(month)}`);
    const r = await readGames(
      monthUrl(month),
      {
        add(g) {
          const speed = speedOf(g.timeControl);
          const result = RESULTS[g.result];
          // UltraBullet left out: not for openings (~1% of the games). Its cells (0-8) stay
          // reserved in statsCodec, so files built before keep their numbering.
          if (!speed || speed === 'ultraBullet' || result === undefined || !g.whiteElo || !g.blackElo) return false;
          const cell = cellOf(speed, bucketOf(g.whiteElo, g.blackElo));
          if (cell < 0) return false;
          onGame(sanMoves(g.movetext, PLIES), cell, result);
          return true;
        },
      },
      MAX_GAMES - kept,
      (read, k) => {
        if (read % 1_000_000 !== 0) return;
        const s = (Date.now() - started) / 1000;
        log(
          `  ${fmt(read)} parties lues (${Math.round(read / s)}/s) · positions ${fmt(nodes)} · transitions ${fmt(transitions)} · stats ${fmt(statsUsed)} · ${mem()}`,
        );
        void k;
      },
    );
    kept += r.kept;
  }
  return kept;
}

const t0 = Date.now();
const kept = await pass('Passage 1 (positions fréquentes)', (sans) => countGame(sans));
let chosenCount = 0;
for (let n = 0; n < nodes; n++) if (n === ROOT || games[n]! >= MIN) (chosen[n] = 1), chosenCount++;
log(`Passage 1 fini : ${fmt(kept)} parties, ${fmt(nodes)} positions suivies, ${fmt(chosenCount)} gardées (≥ ${MIN} parties)`);
const t1 = Date.now();
await pass('Passage 2 (statistiques)', statGame);
const t2 = Date.now();
log(`Passage 2 fini : ${fmt(statsUsed)} compteurs`);

// --- Writing: the counters grouped per position, rows in key order. ---------------------------
const perNode = new Uint32Array(nodes + 1);
for (let i = 0; i < STATS_SLOTS; i++) if (sNode[i] !== -1) perNode[sNode[i]! + 1]!++;
for (let n = 0; n < nodes; n++) perNode[n + 1]! += perNode[n]!;
const order = new Uint32Array(statsUsed);
const fill = perNode.slice(0, nodes);
for (let i = 0; i < STATS_SLOTS; i++) if (sNode[i] !== -1) order[fill[sNode[i]!]!++] = i;

const rows = [];
for (let n = 0; n < nodes; n++) if (chosen[n]) rows.push(n);
// Signed 64-bit order (the order of the INTEGER keys), so the B-tree is written sequentially.
rows.sort((a, b) => (keyHi[a]! | 0) - (keyHi[b]! | 0) || keyLo[a]! - keyLo[b]!);

rmSync(OUT, { force: true });
const db = new DatabaseSync(OUT);
db.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  PRAGMA page_size = 8192;
  CREATE TABLE stats (key INTEGER PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID;
  CREATE TABLE meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const insert = db.prepare('INSERT INTO stats (key, data) VALUES (?, ?)');
let blobBytes = 0;
let movesWritten = 0;
let movesDropped = 0;
db.exec('BEGIN');
for (const n of rows) {
  const total: CellCounts = new Map();
  const moves = new Map<number, CellCounts>();
  for (let j = perNode[n]!; j < perNode[n + 1]!; j++) {
    const i = order[j]!;
    const move = sKey[i]! >>> 6;
    const cell = sKey[i]! & 63;
    const counts: [number, number, number] = [sCount[3 * i]!, sCount[3 * i + 1]!, sCount[3 * i + 2]!];
    if (move === TOTAL) total.set(cell, counts);
    else {
      let m = moves.get(move);
      if (!m) moves.set(move, (m = new Map()));
      m.set(cell, counts);
    }
  }
  const sum = (c: CellCounts) => [...c.values()].reduce((s, [w, d, b]) => s + w + d + b, 0);
  const sorted = [...moves].map(([move, cells]) => ({ move, cells, n: sum(cells) })).sort((a, b) => b.n - a.n);
  movesWritten += Math.min(sorted.length, MAX_MOVES);
  movesDropped += Math.max(0, sorted.length - MAX_MOVES);
  const blob = encodePositionStats({ total, moves: sorted.slice(0, MAX_MOVES) });
  blobBytes += blob.length;
  insert.run(BigInt.asIntN(64, (BigInt(keyHi[n]!) << 32n) | BigInt(keyLo[n]!)), blob);
}
const meta = {
  months: months.map(monthUrl),
  until: new Date(Math.max(...months.map(monthEnd))).toISOString(),
  min: MIN,
  gate: GATE,
  plies: PLIES,
  maxMoves: MAX_MOVES,
  games: kept,
  builtAt: new Date().toISOString(),
};
const setMeta = db.prepare('INSERT INTO meta (name, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(meta)) setMeta.run(k, JSON.stringify(v));
db.exec('COMMIT');

// --- Checks: a few positions read back, for blitz + rapid 1600-1999 (to compare with Lichess). --
const get = db.prepare('SELECT data FROM stats WHERE key = ?');
const asked = cellsOf(['blitz', 'rapid'], [1600, 1800]);
const line = (ucis: string[]) => {
  let fen = START_FEN;
  for (const u of ucis) fen = playUci(fen, u)!.toFen;
  return fen;
};
const checks = [[], ['e2e4'], ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5'], ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5', 'h2h4']].map(
  (ucis) => {
    const fen = line(ucis);
    const row = get.get(zobristOfFen(fen)) as { data: Uint8Array } | undefined;
    if (!row) return { line: ucis.join(' '), fen, stored: false };
    const s = decodePositionStats(row.data, asked);
    return {
      line: ucis.join(' '),
      fen,
      games: s.white + s.draws + s.black,
      moves: s.moves.slice(0, 6).map((m) => `${playUci(fen, m.uci)!.san}:${m.white + m.draws + m.black}`).join(' '),
    };
  },
);
db.close();

console.log(
  'RESULT ' +
    JSON.stringify({
      ...meta,
      seconds: { pass1: Math.round((t1 - t0) / 1000), pass2: Math.round((t2 - t1) / 1000), write: Math.round((Date.now() - t2) / 1000) },
      positionsFollowed: nodes,
      rows: rows.length,
      transitions,
      counters: statsUsed,
      movesWritten,
      movesDropped,
      blobBytes,
      avgBlob: Math.round(blobBytes / Math.max(rows.length, 1)),
      fileBytes: statSync(OUT).size,
      full: { nodes: nodesFull, transitions: transFull, stats: statsFull },
      checks,
      rss: mem(),
    }),
);
