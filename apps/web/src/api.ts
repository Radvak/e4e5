import type { Color, ExplorerResponse, FsrsCard, Grade, RepertoireSummaryCounts, PgnChapter, RepMove, SuggestedMove } from '@tabiya/core';

export interface StatsMeta {
  speeds: string[];
  ratings: number[];
  /** false: closest stored combination, not the one asked for. */
  exact: boolean;
  fetchedAt: string;
  source: 'lichess' | 'seed' | 'import' | 'database';
  /** Months of the games counted (YYYY-MM), else the explorer's whole history. */
  period?: { since: string; until: string };
  /** Nothing stored for the position (Lichess is never asked). */
  reason?: 'not-stored';
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

/** Status of an ApiError when the server could not be reached (offline, server down). */
export const UNREACHABLE = 0;

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(UNREACHABLE, navigator.onLine ? 'Le serveur ne répond pas' : 'Pas de connexion Internet : réessayez une fois en ligne');
  }
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
export interface RepertoireSummary {
  id: string;
  name: string;
  color: Color;
  createdAt: string;
  /** false: paused. */
  active: boolean;
  /** Where the lines part: after the moves of `trunk` (only in the list of repertoires). */
  trunkFen?: string;
  /** The moves from the start while the repertoire has only one (SAN). */
  trunk?: string[];
  /** The moves played from `trunkFen`: where the variations start (UCI). */
  branches?: string[];
}
export interface StoredMove extends RepMove { id: number; source: string }
export interface RepertoireDetail extends RepertoireSummary { moves: StoredMove[] }
export type { Grade };
/** Review state of one of my moves (shared by every repertoire playing it). */
export interface ReviewCard {
  fen: string;
  uci: string;
  /** Estimated probability (0-1) of finding the move now. */
  recall: number;
  due: string;
  reps: number;
  lapses: number;
  interval: number;
  createdAt: string;
  /** The FSRS card itself (answers are scheduled on the device, see core fsrs.ts). */
  fsrs: FsrsCard;
}
/** Training summary of a repertoire, computed on the device (core trainingSummary). */
export type TrainingSummary = RepertoireSummaryCounts;
export interface ImportResult {
  games: number; added: number; duplicates: number; unreachable: number; errors: string[];
}

/** A study in a Lichess player's list (server lichessStudies.ts; no likes, topics nor side). */
export interface LichessStudyListItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}
/** A study chapter by chapter (core PgnChapter, with its Lichess id). */
export interface LichessStudy {
  id: string;
  name: string;
  /** Side most chapters are studied from. */
  color: Color;
  chapters: (PgnChapter & { id?: string })[];
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
  truncated: boolean;
  approximate: number;
  missing: number;
  pending: number;
  /** Probability of reaching each position of the repertoires if I play its line. */
  reach: Record<string, number>;
  gaps: Gap[];
}
export interface GapsResponse {
  white: GapReport | null;
  black: GapReport | null;
}

/** Suggested moves for the side to move (expected score over the likely lines). */
export interface BestMovesResponse {
  /** minReach: probability threshold of the lines its score looks at (null: its own win rate). */
  moves: (Omit<SuggestedMove, 'minReach'> & { minReach: number | null })[];
  /** Lines reached in this share of the games or more are looked at (null: none yet). */
  reach: number | null;
  /** Threshold aimed at. */
  target: number;
  /** Thresholds of the steps, largest first (step n of steps.length: like an engine depth). */
  steps?: number[];
  /** Positions of the next step being fetched in the background: ask again. */
  pending: number;
}

/** One of my synced games in a position (rating: null when the site did not give it). */
export interface MyGameRef {
  id: string;
  source: 'lichess' | 'chesscom';
  url: string;
  winner: 'white' | 'black' | null;
  speed: string;
  white: { name: string; rating: number | null };
  black: { name: string; rating: number | null };
  month: string;
  uci: string | null;
}
export interface MyGames {
  data: ExplorerResponse;
  recentGames: MyGameRef[];
  /** Positions indexed up to this ply: deeper, no games. */
  maxPly: number;
}
/** A repertoire containing a position, and how many of its moves start from it (0: end of its line). */
export interface PositionRepertoire {
  repertoireId: string;
  name: string;
  color: Color;
  moves: number;
}
export interface RepertoireMoveHere {
  repertoireId: string;
  name: string;
  color: Color;
  /** The move in its repertoire (to make it main, pause it). */
  id: number;
  /** Paused in this repertoire: not trained. */
  paused: boolean;
  uci: string;
  san: string;
  isMain: boolean;
  comment: string | null;
  /** PGN annotations of the move (!, ?, …). */
  nags: number[] | null;
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
/** An error: a move of mine other than the prepared one(s). */
export interface InboxItem {
  key: string;
  repertoireId: string;
  fen: string;
  line: { sans: string[]; ucis: string[] };
  move: { san: string; uci: string };
  games: number;
  results: Results;
  expected: string[];
  lastPlayedAt: string;
  /** Every game of the item, most recent first. */
  gameList: { url: string; playedAt: string; result: GameResult; opponent: string; opponentRating: number | null }[];
}
export interface GamesReport {
  games: number;
  repertoires: { id: string; games: number; results: Results; bookMoves: number }[];
  outside: { color: Color; move: string; games: number; results: Results }[];
  /** Score per named opening (Lichess names), per colour, most played first. */
  openings: {
    color: Color;
    family: string;
    games: number;
    results: Results;
    variations: { name: string; eco: string; ucis: string[]; games: number; results: Results }[];
  }[];
  /** errors: my deviations from the repertoires. */
  inbox: { errors: InboxItem[]; errorCount: number };
  recent: {
    id: string;
    url: string;
    playedAt: string;
    color: Color;
    result: GameResult;
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
  updateMove: (id: string, moveId: number, patch: { comment?: string | null; nags?: number[] | null; isMain?: boolean; paused?: boolean }) =>
    request<StoredMove>('PATCH', `/api/repertoires/${id}/moves/${moveId}`, patch),
  deleteMove: (id: string, moveId: number) => request<{ ok: true; pruned: number }>('DELETE', `/api/repertoires/${id}/moves/${moveId}`),
  importPgn: (id: string, pgn: string) => request<ImportResult>('POST', `/api/repertoires/${id}/import-pgn`, { pgn }),
  /** The public studies of a Lichess player, most recently updated first. */
  lichessStudiesBy: (username: string) => request<LichessStudyListItem[]>('GET', `/api/lichess/studies?${new URLSearchParams({ by: username })}`),
  lichessStudy: (id: string) => request<LichessStudy>('GET', `/api/lichess/studies/${encodeURIComponent(id)}`),
  cards: () => request<ReviewCard[]>('GET', '/api/cards'),
  /** An answer, possibly sent later (offline): `id` makes it count once, `reviewedAt` is when it was given. */
  review: (id: string, answer: { fen: string; uci: string; grade: Grade; id: string; reviewedAt: number }) =>
    request<ReviewCard>('POST', `/api/repertoires/${id}/review`, answer),
  gaps: (speeds: string[], ratings: number[], cutoff: number) =>
    request<GapsResponse>('GET', `/api/gaps?${new URLSearchParams({ speeds: speeds.join(','), ratings: ratings.join(','), cutoff: String(cutoff) })}`),
  myGames: (fen: string, color: Color, speeds: string[], days: number) =>
    request<MyGames>('GET', `/api/explorer/mine?${new URLSearchParams({ fen, color, speeds: speeds.join(','), days: String(days) })}`),
  myGameMoves: (id: string) => request<{ moves: string[] }>('GET', `/api/my-games/${encodeURIComponent(id)}`),
  /** Opening of a line (UCI moves, comma separated), null if none is named. */
  opening: (line: string) =>
    request<{ eco: string; name: string } | null>('GET', `/api/explorer/opening?${new URLSearchParams({ line })}`),
  positionRepertoires: (fen: string) => request<PositionRepertoire[]>('GET', `/api/explorer/position-repertoires?${new URLSearchParams({ fen })}`),
  repertoireMovesAt: (fen: string) => request<RepertoireMoveHere[]>('GET', `/api/explorer/repertoires?${new URLSearchParams({ fen })}`),
  syncState: () => request<SyncState>('GET', '/api/games/sync'),
  startSync: (source: 'chesscom' | 'lichess') => request<SyncJob>('POST', '/api/games/sync', { source }),
  gamesReport: (days: number, speeds: string[]) =>
    request<GamesReport>('GET', `/api/games/report?${new URLSearchParams({ days: String(days), speeds: speeds.join(',') })}`),
  dismissInbox: (key: string) => request<{ ok: true }>('POST', '/api/games/inbox/dismiss', { key }),
  restoreInbox: () => request<{ ok: true }>('DELETE', '/api/games/inbox/dismiss'),
  reviewNow: (id: string, fen: string) => request<{ ok: true }>('POST', `/api/repertoires/${id}/cards/due`, { fen }),
  /**
   * `depth`: steps of the search to go through (0: each move's own win rate; default: all).
   * `color`: my side (on the opponent's turn, its moves scored for me; default: the side to move).
   */
  bestMoves: (fen: string, speeds: string[], ratings: number[], depth?: number, color?: Color) =>
    request<BestMovesResponse>(
      'GET',
      `/api/explorer/best?${new URLSearchParams({ fen, speeds: speeds.join(','), ratings: ratings.join(','), ...(depth !== undefined ? { depth: String(depth) } : {}), ...(color ? { color } : {}) })}`,
    ),
  explorer: (fen: string, speeds: string[], ratings: number[]) =>
    request<Stats>(
      'GET',
      `/api/explorer?${new URLSearchParams({ fen, speeds: speeds.join(','), ratings: ratings.join(',') })}`,
    ),
};
