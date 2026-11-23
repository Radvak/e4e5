/**
 * Lichess account through OAuth with PKCE (no client secret, no registration: any client id),
 * shared by the server (its login) and the app without a server (linking Lichess on the device).
 */
import type { GameSources } from './gameSources.js';

type Host = Pick<GameSources, 'lichessHost' | 'headers'>;

export interface LichessAccount {
  id: string;
  username: string;
  perfs?: Record<string, { rating: number; games: number; prov?: boolean }>;
}

/** The token of an authorisation code (PKCE: the verifier of the code challenge sent). */
export async function exchangeCode(src: Host, clientId: string, code: string, verifier: string, redirectUri: string): Promise<string> {
  const res = await fetch(`${src.lichessHost}/api/token`, {
    method: 'POST',
    headers: { ...src.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId }),
  });
  if (!res.ok) throw new Error(`Lichess token exchange failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export async function getAccount(src: Host, token: string): Promise<LichessAccount> {
  const res = await fetch(`${src.lichessHost}/api/account`, { headers: { ...src.headers, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Lichess /api/account failed: ${res.status}`);
  return (await res.json()) as LichessAccount;
}
