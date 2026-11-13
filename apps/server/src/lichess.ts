/** Minimal Lichess API client (server side, with the user's OAuth token). */
import { env } from './env.js';

const UA = 'prepa-cahier';

export interface LichessAccount {
  id: string;
  username: string;
  perfs?: Record<string, { rating: number; games: number; prov?: boolean }>;
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<string> {
  const res = await fetch(`${env.lichessHost}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: env.lichessClientId,
    }),
  });
  if (!res.ok) throw new Error(`Lichess token exchange failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export async function getAccount(token: string): Promise<LichessAccount> {
  const res = await fetch(`${env.lichessHost}/api/account`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Lichess /api/account failed: ${res.status}`);
  return (await res.json()) as LichessAccount;
}

export class RateLimited extends Error {
  constructor(public retryAt: number) {
    super('Rate limited by Lichess');
  }
}

/**
 * Lichess asks API clients to make one request at a time and to wait a full minute after a
 * 429. All explorer calls of all users go through this queue.
 */
let queue: Promise<unknown> = Promise.resolve();
let cooldownUntil = 0;

/** Time (ms) until which Lichess asked us to stop (0 or past: no cooldown). */
export const explorerCooldownUntil = () => cooldownUntil;

export function explorerFetch(path: string, token: string): Promise<unknown> {
  const task = queue.then(async () => {
    if (Date.now() < cooldownUntil) throw new RateLimited(cooldownUntil);
    const res = await fetch(`${env.explorerUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, Accept: 'application/json' },
    });
    if (res.status === 429) {
      cooldownUntil = Date.now() + 60_000;
      throw new RateLimited(cooldownUntil);
    }
    if (!res.ok) throw new Error(`Lichess explorer ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  });
  queue = task.catch(() => undefined);
  return task;
}

/**
 * Streaming explorer endpoint (ndjson, e.g. `/player`, which indexes on demand and sends
 * updated results until done). Waits at most `maxMs`, then answers the latest result with
 * `done: false`. Goes through the same one-at-a-time queue as `explorerFetch`.
 */
export function explorerStream(path: string, token: string, maxMs: number): Promise<{ data: unknown; done: boolean }> {
  const task = queue.then(async () => {
    if (Date.now() < cooldownUntil) throw new RateLimited(cooldownUntil);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), maxMs);
    let latest: unknown = null;
    let done = false;
    try {
      const res = await fetch(`${env.explorerUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, Accept: 'application/x-ndjson' },
        signal: abort.signal,
      });
      if (res.status === 429) {
        cooldownUntil = Date.now() + 60_000;
        throw new RateLimited(cooldownUntil);
      }
      if (!res.ok || !res.body) throw new Error(`Lichess explorer ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) if (line.trim()) latest = JSON.parse(line);
      }
      if (buffer.trim()) latest = JSON.parse(buffer);
      done = true;
    } catch (e) {
      if (!abort.signal.aborted) throw e;
    } finally {
      clearTimeout(timer);
    }
    return { data: latest, done };
  });
  queue = task.catch(() => undefined);
  return task;
}

export interface ExportedGame {
  id: string;
  players: { white: { user?: { name: string }; rating?: number }; black: { user?: { name: string }; rating?: number } };
  /** SAN moves separated by spaces. */
  moves: string;
  winner?: 'white' | 'black';
  status: string;
  speed: string;
  createdAt: number;
}

/** A Lichess game (public, no token needed). */
export async function exportGame(id: string): Promise<ExportedGame> {
  const res = await fetch(`${env.lichessHost}/game/export/${id}?moves=true&clocks=false&evals=false&opening=false`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) throw Object.assign(new Error(`Lichess game ${id}: ${res.status}`), { statusCode: res.status === 404 ? 404 : 502 });
  return (await res.json()) as ExportedGame;
}

/** A game of the Lichess games export (only the fields used). */
export interface LichessGameExport {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  players: { white: { user?: { name: string; id: string }; rating?: number }; black: { user?: { name: string; id: string }; rating?: number } };
  winner?: 'white' | 'black';
  moves: string;
  initialFen?: string;
}

/** Games of a Lichess user played since `since` (ms), oldest first. */
export async function lichessUserGames(username: string, since: number | null, token: string | null): Promise<LichessGameExport[]> {
  const params = new URLSearchParams({
    moves: 'true',
    clocks: 'false',
    evals: 'false',
    opening: 'false',
    sort: 'dateAsc',
    perfType: 'ultraBullet,bullet,blitz,rapid,classical,correspondence',
    ...(since ? { since: String(since + 1) } : {}),
  });
  const res = await fetch(`${env.lichessHost}/api/games/user/${encodeURIComponent(username)}?${params}`, {
    headers: { Accept: 'application/x-ndjson', 'User-Agent': UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`Lichess games export ${res.status}`);
  return (await res.text())
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as LichessGameExport);
}
