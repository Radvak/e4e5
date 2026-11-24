/**
 * Opening names (lichess-org/chess-openings, seed/openings.tsv): a played game is named after the
 * last position of its opening that has a name (by position, so transpositions are recognised).
 * The table is given once by its user (setOpeningsTable): the server reads the file, the app
 * loads it with its code.
 */
import { fenKey, playSanOn, playUciOn, positionFromFen, START_FEN } from '@e4e5/core';

export interface Opening {
  eco: string;
  /** "Sicilian Defense: Najdorf Variation" */
  name: string;
  /** "Sicilian Defense" (the name before ":"). */
  family: string;
  /** UCI moves of the named line. */
  ucis: string[];
}

/** Longest named line, in plies: no need to look further in a game. */
let maxPlies = 0;
let byFen: Map<string, Opening> | null = null;
let table: (() => string) | null = null;

/** Where the table comes from (the text of openings.tsv), read the first time a name is asked. */
export function setOpeningsTable(read: () => string) {
  table = read;
  byFen = null;
}

function load(): Map<string, Opening> {
  if (!table) throw new Error('Table des ouvertures non chargée (setOpeningsTable)');
  const map = new Map<string, Opening>();
  const lines = table().split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('eco\t')) continue;
    const [eco, name, pgn] = line.split('\t');
    if (!eco || !name || !pgn) continue;
    const pos = positionFromFen(START_FEN);
    const ucis: string[] = [];
    let ok = true;
    for (const token of pgn.split(/\s+/)) {
      if (!token || /^\d+\.+$/.test(token)) continue;
      const m = playSanOn(pos, token);
      if (!m) {
        ok = false;
        break;
      }
      ucis.push(m.uci);
    }
    if (!ok) continue;
    const key = fenKey(pos);
    // Several lines reaching the same position: the first (shortest) name is kept.
    if (map.has(key)) continue;
    map.set(key, { eco, name, family: name.split(':')[0]!.trim(), ucis });
    maxPlies = Math.max(maxPlies, ucis.length);
  }
  return map;
}

/** The last named position along `moves` (played by `play`), null if none. */
function lastNamed(moves: string[], play: (pos: ReturnType<typeof positionFromFen>, move: string) => unknown): Opening | null {
  byFen ??= load();
  const pos = positionFromFen(START_FEN);
  let found: Opening | null = null;
  for (const move of moves.slice(0, maxPlies)) {
    if (!play(pos, move)) break;
    found = byFen.get(fenKey(pos)) ?? found;
  }
  return found;
}

/** The opening of a game (SAN moves), null if not even its first move is named. */
export const openingOf = (sans: string[]) => lastNamed(sans, playSanOn);

/** The opening of a line (UCI moves from the initial position), null if none is named. */
export const openingOfUcis = (ucis: string[]) => lastNamed(ucis, playUciOn);
