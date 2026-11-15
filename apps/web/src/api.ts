import type { Color, ExplorerResponse, RepMove } from '@prepa-cahier/core';

export interface StatsMeta {
  speeds: string[];
  ratings: number[];
  /** false: closest stored combination, not the one asked for. */
  exact: boolean;
  fetchedAt: string;
  source: 'lichess' | 'seed' | 'import';
  reason?: 'no-token' | 'rate-limited' | 'unreachable';
}
export interface Stats {
  data: ExplorerResponse;
  meta: StatsMeta;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, err.error ?? res.statusText, err);
  }
  return res.json() as Promise<T>;
}

export type Perfs = Record<string, { rating: number; games: number; prov?: boolean }>;
export type ChesscomRatings = Partial<Record<'rapid' | 'blitz' | 'bullet' | 'daily', number>>;
export interface Me {
  id: string;
  username: string;
  guest: boolean;
  hasPassword: boolean;
  login: string | null;
  lichess: { username: string; perfs: Perfs | null } | null;
  chesscom: { username: string; ratings: ChesscomRatings | null } | null;
  /** Live explorer statistics available (own Lichess token or the app's); stored ones are always served. */
  explorer: boolean;
}
export interface RepertoireSummary { id: string; name: string; color: Color; createdAt: string; /** false: paused. */ active: boolean }
export interface StoredMove extends RepMove { id: number; source: string }
export interface RepertoireDetail extends RepertoireSummary { moves: StoredMove[] }
export type Grade = 'again' | 'hard' | 'good' | 'easy';
export interface ReviewCard {
  fen: string;
  /** Estimated probability (0-1) of finding the move now. */
  recall: number;
  due: string;
  reps: number;
  lapses: number;
  interval: number;
  createdAt: string;
}
export interface ReviewLogEntry { repertoireId: string; grade: Grade; isNew: boolean; reviewedAt: string }
export interface TrainingSummary {
  repertoireId: string;
  active: boolean;
  /** Positions to train, and lines of the repertoire. */
  total: number;
  totalLines: number;
  /** Positions due, and the lines they form. */
  due: number;
  dueLines: number;
  /** Lines learnt today, and whole lines not learnt yet. */
  learntTodayLines: number;
  availableLines: number;
  /** New lines still allowed today, all repertoires together. */
  remainingNewLines: number;
  /** New lines this repertoire can take today, and lines to go through today (to review + new). */
  newLines: number;
  lines: number;
}
export interface ImportResult {
  games: number; added: number; duplicates: number; unreachable: number; errors: string[];
}

export interface Gap {
  kind: 'missing-reply' | 'no-answer';
  fen: string;
  move: { uci: string; san: string } | null;
  prob: number;
  /** SAN moves from the initial position to `fen`. */
  line: string[];
  /** The same moves in UCI. */
  ucis: string[];
  /** Repertoire going furthest along this line; null: inside every repertoire's trunk. */
  repertoireId: string | null;
  /** Every repertoire of the colour, best suited first. */
  ranking: string[];
}
/** Analysis of all the repertoires of one colour together. */
export interface GapReport {
  /** Expected number of moves played in the preparation (a minimum when `unknown` > 0). */
  depth: number;
  lost: number;
  ends: number;
  /** Share of games reaching positions without statistics. */
  unknown: number;
  truncated: boolean;
  approximate: number;
  missing: number;
  pending: number;
  /** Probability of reaching each position where it is my turn (positions to learn). */
  reach: Record<string, number>;
  gaps: Gap[];
}
export interface GapsResponse {
  live: boolean;
  white: GapReport | null;
  black: GapReport | null;
}

export interface ExplorerGameRef {
  id: string;
  winner: 'white' | 'black' | null;
  speed: string | null;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  month: string;
  /** Move played in the position (Lichess players database only). */
  uci: string | null;
}
export interface MyGames {
  player: string;
  /** false: Lichess is still indexing the games, ask again. */
  done: boolean;
  data: ExplorerResponse;
  recentGames: ExplorerGameRef[];
}
export interface RepertoireMoveHere {
  repertoireId: string;
  name: string;
  color: Color;
  uci: string;
  san: string;
  isMain: boolean;
  comment: string | null;
}
export interface LichessGame {
  id: string;
  white: { name: string; rating: number | null };
  black: { name: string; rating: number | null };
  winner: 'white' | 'black' | null;
  status: string;
  speed: string;
  date: string;
  /** SAN moves. */
  moves: string[];
}

export type GameResult = 'win' | 'draw' | 'loss';
export type Results = Record<GameResult, number>;
export interface SyncJob {
  source: 'chesscom' | 'lichess';
  status: 'running' | 'done' | 'error';
  startedAt: string;
  fetched: number;
  added: number;
  progress?: { done: number; total: number };
  reviews?: number;
  error?: string;
}
export interface SyncState {
  accounts: { chesscom: string | null; lichess: string | null };
  syncs: { source: 'chesscom' | 'lichess'; account: string; lastGameAt: string | null; syncedAt: string }[];
  counts: Partial<Record<'chesscom' | 'lichess', number>>;
  jobs: SyncJob[];
}
export interface InboxItem {
  key: string;
  kind: 'novelty' | 'deviation' | 'end';
  repertoireId: string;
  fen: string;
  line: { sans: string[]; ucis: string[] };
  move: { san: string; uci: string };
  games: number;
  results: Results;
  replies: { san: string; uci: string; games: number; results: Results }[];
  expected: string[];
  lastPlayedAt: string;
  example: string;
}
export interface GamesReport {
  games: number;
  repertoires: { id: string; games: number; results: Results; bookMoves: number }[];
  outside: { color: Color; move: string; games: number; results: Results }[];
  /** errors: my deviations; novelties: opponents' new moves, within a line or after its end. */
  inbox: { errors: InboxItem[]; novelties: InboxItem[]; errorCount: number };
  recent: {
    id: string;
    url: string;
    playedAt: string;
    color: Color;
    result: GameResult;
    speed: string;
    opponent: string;
    opponentRating: number | null;
    repertoireId: string | null;
    kind: 'in-book' | 'my-deviation' | 'opponent-novelty' | 'end-of-prep' | 'outside';
    ply: number;
    move: { san: string; uci: string } | null;
    ucis: string[];
  }[];
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  authConfig: () => request<{ guestLogin: boolean }>('GET', '/api/auth/config'),
  guestLogin: (username: string) => request<{ ok: true }>('POST', '/api/auth/guest', { username }),
  register: (username: string, password: string) => request<{ ok: true }>('POST', '/api/auth/register', { username, password }),
  passwordLogin: (username: string, password: string) =>
    request<{ ok: true }>('POST', '/api/auth/password', { username, password }),
  updateMe: (patch: { chesscomUsername?: string | null; password?: string; login?: string }) =>
    request<{ user: Me; warning?: string }>('PATCH', '/api/me', patch),
  unlinkLichess: () => request<{ user: Me }>('DELETE', '/api/me/lichess'),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  repertoires: () => request<RepertoireSummary[]>('GET', '/api/repertoires'),
  createRepertoire: (name: string, color: Color) => request<RepertoireSummary>('POST', '/api/repertoires', { name, color }),
  renameRepertoire: (id: string, name: string) => request<RepertoireSummary>('PATCH', `/api/repertoires/${id}`, { name }),
  setRepertoireActive: (id: string, active: boolean) => request<RepertoireSummary>('PATCH', `/api/repertoires/${id}`, { active }),
  deleteRepertoire: (id: string) => request<{ ok: true }>('DELETE', `/api/repertoires/${id}`),
  repertoire: (id: string) => request<RepertoireDetail>('GET', `/api/repertoires/${id}`),
  saveLine: (id: string, ucis: string[]) =>
    request<{ added: number }>('POST', `/api/repertoires/${id}/lines`, { ucis }),
  updateMove: (id: string, moveId: number, patch: { comment?: string | null; isMain?: boolean }) =>
    request<StoredMove>('PATCH', `/api/repertoires/${id}/moves/${moveId}`, patch),
  deleteMove: (id: string, moveId: number) => request<{ ok: true; pruned: number }>('DELETE', `/api/repertoires/${id}/moves/${moveId}`),
  importPgn: (id: string, pgn: string) => request<ImportResult>('POST', `/api/repertoires/${id}/import-pgn`, { pgn }),
  cards: (id: string) => request<ReviewCard[]>('GET', `/api/repertoires/${id}/cards`),
  review: (id: string, fen: string, grade: Grade) => request<ReviewCard>('POST', `/api/repertoires/${id}/review`, { fen, grade }),
  trainingSummary: (dayStart: number, newPerDay: number) =>
    request<TrainingSummary[]>('GET', `/api/training/summary?${new URLSearchParams({ dayStart: String(dayStart), newPerDay: String(newPerDay) })}`),
  statsHistory: (days: number) => request<ReviewLogEntry[]>('GET', `/api/stats/history?days=${days}`),
  gaps: (speeds: string[], ratings: number[], cutoff: number) =>
    request<GapsResponse>('GET', `/api/gaps?${new URLSearchParams({ speeds: speeds.join(','), ratings: ratings.join(','), cutoff: String(cutoff) })}`),
  explorerGames: (fen: string, speeds: string[], ratings: number[]) =>
    request<{ topGames: ExplorerGameRef[]; recentGames: ExplorerGameRef[] }>(
      'GET',
      `/api/explorer/games?${new URLSearchParams({ fen, speeds: speeds.join(','), ratings: ratings.join(',') })}`,
    ),
  myGames: (fen: string, color: Color, speeds: string[]) =>
    request<MyGames>('GET', `/api/explorer/mine?${new URLSearchParams({ fen, color, speeds: speeds.join(',') })}`),
  repertoireMovesAt: (fen: string) => request<RepertoireMoveHere[]>('GET', `/api/explorer/repertoires?${new URLSearchParams({ fen })}`),
  lichessGame: (id: string) => request<LichessGame>('GET', `/api/lichess-games/${id}`),
  syncState: () => request<SyncState>('GET', '/api/games/sync'),
  startSync: (source: 'chesscom' | 'lichess') => request<SyncJob>('POST', '/api/games/sync', { source }),
  gamesReport: (days: number, speeds: string[]) =>
    request<GamesReport>('GET', `/api/games/report?${new URLSearchParams({ days: String(days), speeds: speeds.join(',') })}`),
  dismissInbox: (key: string) => request<{ ok: true }>('POST', '/api/games/inbox/dismiss', { key }),
  restoreInbox: () => request<{ ok: true }>('DELETE', '/api/games/inbox/dismiss'),
  reviewNow: (id: string, fen: string) => request<ReviewCard>('POST', `/api/repertoires/${id}/cards/due`, { fen }),
  explorer: (fen: string, speeds: string[], ratings: number[]) =>
    request<Stats>(
      'GET',
      `/api/explorer?${new URLSearchParams({ fen, speeds: speeds.join(','), ratings: ratings.join(',') })}`,
    ),
};
