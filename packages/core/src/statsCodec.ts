/**
 * Binary format of the statistics of one position, as built from the Lichess game database
 * (one row per position, keyed by its Zobrist key, see zobrist.ts). The games are counted per
 * cell, a speed and a rating bucket of the Lichess explorer, so any settings (speeds and buckets)
 * are answered by adding up their cells.
 *
 *   totals: varint n, then n × (u8 cell, varint white, varint draws, varint black)
 *   moves:  varint n, then n × (u16 move, varint cells, cells × (u8 cell, varint w, d, b))
 *
 * Totals count every game reaching the position (also the ones ending there); varints are
 * unsigned LEB128; a move is from (6 bits) | to (6 bits) << 6 | promotion (3 bits) << 12, with
 * castling as the king's move (e1g1).
 */
import { parseSquare, makeSquare } from 'chessops';
import { RATING_BUCKETS, type ExplorerMove } from './explorer.js';

export const STATS_SPEEDS = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical'] as const;
export const CELL_COUNT = STATS_SPEEDS.length * RATING_BUCKETS.length;

/** Cell of a speed and rating bucket; -1 if unknown. */
export function cellOf(speed: string, bucket: number): number {
  const s = (STATS_SPEEDS as readonly string[]).indexOf(speed);
  const b = (RATING_BUCKETS as readonly number[]).indexOf(bucket);
  return s < 0 || b < 0 ? -1 : s * RATING_BUCKETS.length + b;
}

/** The cells of some speeds and buckets (the explorer settings). */
export function cellsOf(speeds: string[], buckets: number[]): Set<number> {
  const out = new Set<number>();
  for (const s of speeds) for (const b of buckets) if (cellOf(s, b) >= 0) out.add(cellOf(s, b));
  return out;
}

const PROMOTIONS = ['', 'n', 'b', 'r', 'q'];

export function encodeMove(uci: string): number {
  const promo = PROMOTIONS.indexOf(uci.slice(4));
  return parseSquare(uci.slice(0, 2))! | (parseSquare(uci.slice(2, 4))! << 6) | (Math.max(promo, 0) << 12);
}

export function decodeMove(code: number): string {
  return makeSquare(code & 63) + makeSquare((code >> 6) & 63) + PROMOTIONS[(code >> 12) & 7];
}

/** Games per result, by cell. */
export type CellCounts = Map<number, [white: number, draws: number, black: number]>;

export interface PositionCounts {
  total: CellCounts;
  moves: { move: number; cells: CellCounts }[];
}

/** Growable byte buffer with LEB128 varints. */
class Writer {
  bytes = new Uint8Array(256);
  length = 0;
  private room(n: number) {
    if (this.length + n <= this.bytes.length) return;
    const next = new Uint8Array(Math.max(this.bytes.length * 2, this.length + n));
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
  }
  u8(x: number) {
    this.room(1);
    this.bytes[this.length++] = x;
  }
  u16(x: number) {
    this.room(2);
    this.bytes[this.length++] = x & 255;
    this.bytes[this.length++] = x >> 8;
  }
  varint(x: number) {
    this.room(5);
    while (x >= 128) {
      this.bytes[this.length++] = (x & 127) | 128;
      x = Math.floor(x / 128);
    }
    this.bytes[this.length++] = x;
  }
  cells(cells: CellCounts) {
    this.varint(cells.size);
    for (const [cell, [w, d, b]] of [...cells].sort((x, y) => x[0] - y[0])) {
      this.u8(cell);
      this.varint(w);
      this.varint(d);
      this.varint(b);
    }
  }
}

export function encodePositionStats(stats: PositionCounts): Uint8Array {
  const w = new Writer();
  w.cells(stats.total);
  w.varint(stats.moves.length);
  for (const m of stats.moves) {
    w.u16(m.move);
    w.cells(m.cells);
  }
  return w.bytes.slice(0, w.length);
}

/**
 * Statistics of the position for the cells asked (the explorer settings), in the format of the
 * Lichess explorer without SAN (the caller knows the position), most played moves first. Moves
 * without a game in these cells are left out.
 */
export function decodePositionStats(
  data: Uint8Array,
  cells: Set<number>,
): { white: number; draws: number; black: number; moves: Omit<ExplorerMove, 'san'>[] } {
  let i = 0;
  const varint = () => {
    let x = 0;
    let scale = 1;
    let byte: number;
    do {
      byte = data[i++]!;
      x += (byte & 127) * scale;
      scale *= 128;
    } while (byte & 128);
    return x;
  };
  const sum = () => {
    const out = { white: 0, draws: 0, black: 0 };
    for (let n = varint(); n > 0; n--) {
      const cell = data[i++]!;
      const w = varint();
      const d = varint();
      const b = varint();
      if (!cells.has(cell)) continue;
      out.white += w;
      out.draws += d;
      out.black += b;
    }
    return out;
  };
  const total = sum();
  const moves: Omit<ExplorerMove, 'san'>[] = [];
  for (let n = varint(); n > 0; n--) {
    const code = data[i]! | (data[i + 1]! << 8);
    i += 2;
    const counts = sum();
    if (counts.white + counts.draws + counts.black) moves.push({ uci: decodeMove(code), ...counts });
  }
  moves.sort((a, b) => b.white + b.draws + b.black - (a.white + a.draws + a.black));
  return { ...total, moves };
}
