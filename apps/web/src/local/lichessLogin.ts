/**
 * Linking Lichess without a server (local mode): OAuth with PKCE from the app itself. Lichess
 * needs no client secret nor registration; the token stays on the device (local database).
 *
 * The page goes to Lichess and comes back to /lichess-callback (LichessCallback page) with a
 * code, exchanged here for the token. In the mobile app, Lichess opens in the system browser and
 * comes back to the app's own address (com.e4e5://lichess-callback), handed to the same page by
 * listenForLichessCallback.
 */
import { exchangeCode, linkLichess, PUBLIC_SOURCES } from '@e4e5/data';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { isNative, NATIVE_CALLBACK } from '../native';
import { LOCAL_USER, localDb } from './db';
import { t } from '../i18n';

const CLIENT_ID = 'e4e5';
const KEY = 'e4e5.lichess-oauth';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const redirectUri = () => (isNative() ? NATIVE_CALLBACK : `${location.origin}${import.meta.env.BASE_URL}lichess-callback`);

/** Goes to Lichess to authorise the app (back on /lichess-callback). */
export async function startLichessLogin(): Promise<void> {
  const verifier = random(32);
  const state = random(16);
  sessionStorage.setItem(KEY, JSON.stringify({ verifier, state }));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  const url = `${PUBLIC_SOURCES.lichessHost}/oauth?${params}`;
  if (isNative()) await Browser.open({ url });
  else location.assign(url);
}

/** Mobile app: back from Lichess on the app's address, the code handed to /lichess-callback. */
export function listenForLichessCallback() {
  void App.addListener('appUrlOpen', ({ url }) => {
    if (!url.startsWith(NATIVE_CALLBACK)) return;
    void Browser.close().catch(() => undefined);
    location.assign(`${import.meta.env.BASE_URL}lichess-callback${url.slice(NATIVE_CALLBACK.length)}`);
  });
}

/** Back from Lichess: the code exchanged for the token, the account linked on the device. */
export async function finishLichessLogin(params: URLSearchParams): Promise<void> {
  const raw = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  const error = params.get('error');
  if (error) throw new Error(error === 'access_denied' ? t('Autorisation refusée sur Lichess', 'Authorization denied on Lichess') : t(`Lichess : ${error}`, `Lichess: ${error}`));
  const saved = raw ? (JSON.parse(raw) as { verifier: string; state: string }) : null;
  const code = params.get('code');
  if (!saved || !code || params.get('state') !== saved.state) throw new Error(t('Retour de Lichess inattendu : recommencez depuis Mon compte', 'Unexpected return from Lichess: start again from My account'));
  const token = await exchangeCode(PUBLIC_SOURCES, CLIENT_ID, code, saved.verifier, redirectUri());
  const { db } = await localDb();
  await linkLichess(db, LOCAL_USER, token, PUBLIC_SOURCES);
}
