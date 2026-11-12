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
export interface RepertoireSummary { id: string; name: string; color: Color; createdAt: string }
export interface StoredMove extends RepMove { id: number; source: string }
export interface RepertoireDetail extends RepertoireSummary { moves: StoredMove[] }
export type Grade = 'again' | 'hard' | 'good' | 'easy';
export interface ReviewCard { fen: string; due: string; reps: number; lapses: number; interval: number; createdAt: string }
export interface TrainingSummary { repertoireId: string; total: number; due: number; new: number }
export interface ImportResult {
  games: number; added: number; duplicates: number; unreachable: number; errors: string[];
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  authConfig: () => request<{ guestLogin: boolean }>('GET', '/api/auth/config'),
  guestLogin: (username: string) => request<{ ok: true }>('POST', '/api/auth/guest', { username }),
  register: (username: string, password: string) => request<{ ok: true }>('POST', '/api/auth/register', { username, password }),
  passwordLogin: (username: string, password: string) =>
    request<{ ok: true }>('POST', '/api/auth/password', { username, password }),
  updateMe: (patch: { chesscomUsername?: string | null; password?: string }) =>
    request<{ user: Me; warning?: string }>('PATCH', '/api/me', patch),
  unlinkLichess: () => request<{ user: Me }>('DELETE', '/api/me/lichess'),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  repertoires: () => request<RepertoireSummary[]>('GET', '/api/repertoires'),
  createRepertoire: (name: string, color: Color) => request<RepertoireSummary>('POST', '/api/repertoires', { name, color }),
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
  explorer: (fen: string, speeds: string[], ratings: number[]) =>
    request<Stats>(
      'GET',
      `/api/explorer?${new URLSearchParams({ fen, speeds: speeds.join(','), ratings: ratings.join(',') })}`,
    ),
};
