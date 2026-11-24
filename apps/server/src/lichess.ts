/** Minimal Lichess API client (server side): OAuth (shared, @tabiya/data lichessAccount.ts), explorer queue. */
import { exchangeCode as sharedExchangeCode, getAccount as sharedGetAccount, type LichessAccount } from '@tabiya/data';
import { env } from './env.js';

const UA = 'tabiya';

export type { LichessAccount };

const host = () => ({ lichessHost: env.lichessHost, headers: { 'User-Agent': UA } });

export const exchangeCode = (code: string, verifier: string, redirectUri: string): Promise<string> =>
  sharedExchangeCode(host(), env.lichessClientId, code, verifier, redirectUri);

export const getAccount = (token: string): Promise<LichessAccount> => sharedGetAccount(host(), token);

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
 * Calls to the lichess.org API (studies, games export), one at a time for all users: Lichess
 * answers 429 "Please only run 1 request(s) at a time" to a second request from the same address.
 * The explorer (another host) has its own queue above.
 */
let apiQueue: Promise<unknown> = Promise.resolve();
export function lichessApiQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = apiQueue.then(task);
  apiQueue = run.catch(() => undefined);
  return run;
}
