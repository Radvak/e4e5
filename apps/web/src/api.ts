import { t, translateError } from './i18n';
import type { Color, ExplorerResponse, FsrsCard, Grade, RepertoireSummaryCounts, PgnChapter, RepMove, SuggestedMove } from '@e4e5/core';

export interface StatsMeta {
  speeds: string[];
  ratings: number[];
  /** false: closest stored combination, not the one asked for. */
  exact: boolean;
  fetchedAt: string;
  source: 'lichess' | 'seed' | 'import' | 'database';
  /** Months of the games counted (YYYY-MM), else the explorer's whole history. */
  period?: { since: string; until: string };
  /**
   * Why there are no statistics. not-stored: nothing stored for the position (the server never
   * asks Lichess); local-stats: local mode, the statistics files of the settings not on the device.
   */
  reason?: 'not-stored' | 'local-stats';
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
    // Messages of @e4e5/data are in French.
    super(translateError(message));
  }
}

/** Status of an ApiError when Lichess or Chess.com could not be reached (offline). */
export const UNREACHABLE = 0;

export type Perfs = Record<string, { rating: number; games: number; prov?: boolean }>;
export type ChesscomRatings = Partial<Record<'rapid' | 'blitz' | 'bullet' | 'daily', number>>;
export interface Me {
  id: string;
  username: string;
  lichess: { username: string; perfs: Perfs | null } | null;
  chesscom: { username: string; ratings: ChesscomRatings | null } | null;
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

/** A study in a Lichess player's list (@e4e5/data lichessStudies.ts; no likes, topics nor side). */
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

/** What the app asks for, answered on this device (local/backend.ts). */
export interface Api {
  me: () => Promise<Me>;
  updateMe: (patch: { chesscomUsername?: string | null }) => Promise<{ user: Me; warning?: string }>;
  unlinkLichess: () => Promise<{ user: Me }>;
  repertoires: () => Promise<RepertoireSummary[]>;
  createRepertoire: (name: string, color: Color) => Promise<RepertoireSummary>;
  renameRepertoire: (id: string, name: string) => Promise<RepertoireSummary>;
  setRepertoireActive: (id: string, active: boolean) => Promise<RepertoireSummary>;
  deleteRepertoire: (id: string) => Promise<{ ok: true }>;
  repertoire: (id: string) => Promise<RepertoireDetail>;
  saveLine: (id: string, ucis: string[]) => Promise<{ added: number }>;
  updateMove: (id: string, moveId: number, patch: { comment?: string | null; nags?: number[] | null; isMain?: boolean; paused?: boolean }) => Promise<StoredMove>;
  deleteMove: (id: string, moveId: number) => Promise<{ ok: true; pruned: number }>;
  importPgn: (id: string, pgn: string) => Promise<ImportResult>;
  /** The studies of a Lichess player (private ones too for my own account), most recently updated first. */
  lichessStudiesBy: (username: string) => Promise<LichessStudyListItem[]>;
  lichessStudy: (id: string) => Promise<LichessStudy>;
  cards: () => Promise<ReviewCard[]>;
  /** An answer: `id` makes it count once, `reviewedAt` is when it was given. */
  review: (id: string, answer: { fen: string; uci: string; grade: Grade; id: string; reviewedAt: number }) => Promise<ReviewCard>;
  gaps: (speeds: string[], ratings: number[], cutoff: number) => Promise<GapsResponse>;
  myGames: (fen: string, color: Color, speeds: string[], days: number) => Promise<MyGames>;
  myGameMoves: (id: string) => Promise<{ moves: string[] }>;
  /** Opening of a line (UCI moves, comma separated), null if none is named. */
  opening: (line: string) => Promise<{ eco: string; name: string } | null>;
  positionRepertoires: (fen: string) => Promise<PositionRepertoire[]>;
  repertoireMovesAt: (fen: string) => Promise<RepertoireMoveHere[]>;
  syncState: () => Promise<SyncState>;
  startSync: (source: 'chesscom' | 'lichess') => Promise<SyncJob>;
  gamesReport: (days: number, speeds: string[]) => Promise<GamesReport>;
  dismissInbox: (key: string) => Promise<{ ok: true }>;
  restoreInbox: () => Promise<{ ok: true }>;
  reviewNow: (id: string, fen: string) => Promise<{ ok: true }>;
  /**
   * `depth`: steps of the search to go through (0: each move's own win rate; default: all).
   * `color`: my side (on the opponent's turn, its moves scored for me; default: the side to move).
   */
  bestMoves: (fen: string, speeds: string[], ratings: number[], depth?: number, color?: Color) => Promise<BestMovesResponse>;
  explorer: (fen: string, speeds: string[], ratings: number[]) => Promise<Stats>;
}

/**
 * The API: each method answered by the local database (local/backend.ts), loaded at the first
 * call so SQLite is only downloaded when used.
 */
export const api = new Proxy({} as Api, {
  get: (_, key: string) =>
    (...args: unknown[]) =>
      import('./local/backend').then((m) => (m.localApi[key as keyof Api] as (...a: unknown[]) => Promise<unknown>)(...args)),
});
