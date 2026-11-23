/** Minimal Lichess API client (server side, with the user's OAuth token). */
import { env } from './env.js';

const UA = 'tabiya';

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
