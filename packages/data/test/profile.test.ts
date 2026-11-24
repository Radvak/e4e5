import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyAccounts, exchangeCode, getProfile, linkLichess, setChesscom, unlinkLichess, type Db, type GameSources } from '../src/index.js';
import * as schema from '../src/schema.js';
import { users } from '../src/schema.js';

const MIGRATIONS = fileURLToPath(new URL('../../../apps/server/drizzle', import.meta.url));
const SRC: GameSources = { chesscomApi: 'https://chesscom.test', lichessHost: 'https://lichess.test' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === 'https://chesscom.test/pub/player/moi/stats') return json({ chess_blitz: { last: { rating: 1510 } }, chess_rapid: { last: { rating: 1620 } } });
  if (url === 'https://lichess.test/api/token') {
    const body = new URLSearchParams(String(init?.body));
    return body.get('code_verifier') === 'v' && body.get('code') === 'c' ? json({ access_token: 'tok' }) : json({ error: 'bad' }, 400);
  }
  if (url === 'https://lichess.test/api/account') {
    const auth = new Headers(init?.headers).get('Authorization');
    return auth === 'Bearer tok' ? json({ id: 'moi', username: 'Moi', perfs: { blitz: { rating: 1700, games: 10 } } }) : json({}, 401);
  }
  return json({}, 404);
});

let db: Db;
beforeEach(async () => {
  vi.stubGlobal('fetch', fakeFetch);
  const d = drizzle(createClient({ url: ':memory:' }), { schema });
  await migrate(d, { migrationsFolder: MIGRATIONS });
  await d.insert(users).values({ id: 'local', username: 'Moi' });
  db = d;
});
afterEach(() => vi.unstubAllGlobals());

describe('accounts on the device', () => {
  it('sets the Chess.com username with its ratings, refuses an unknown one', async () => {
    expect(await setChesscom(db, 'local', 'Moi', SRC)).toEqual({ warning: undefined });
    expect((await getProfile(db, 'local')).chesscom).toEqual({ username: 'Moi', ratings: { blitz: 1510, rapid: 1620 } });
    await expect(setChesscom(db, 'local', 'personne', SRC)).rejects.toMatchObject({ statusCode: 400 });
    await setChesscom(db, 'local', null, SRC);
    expect((await getProfile(db, 'local')).chesscom).toBeNull();
  });

  it('links Lichess with a PKCE code, and unlinks it', async () => {
    const token = await exchangeCode(SRC, 'e4e5', 'c', 'v', 'http://localhost/lichess-callback');
    await linkLichess(db, 'local', token, SRC);
    expect(await getProfile(db, 'local')).toMatchObject({ username: 'Moi', lichess: { id: 'moi', username: 'Moi' }, lichessToken: 'tok' });
    await unlinkLichess(db, 'local');
    expect(await getProfile(db, 'local')).toMatchObject({ lichess: null, lichessToken: null });
  });

  it('copies the accounts of the server, keeping the token of the same Lichess account', async () => {
    await linkLichess(db, 'local', 'tok', SRC);
    await copyAccounts(db, 'local', { username: 'Moi', lichess: { username: 'Moi', perfs: null }, chesscom: { username: 'Autre', ratings: null } });
    expect(await getProfile(db, 'local')).toMatchObject({ lichess: { id: 'moi' }, lichessToken: 'tok', chesscom: { username: 'Autre' } });
    await copyAccounts(db, 'local', { username: 'X', lichess: { username: 'X', perfs: null }, chesscom: null });
    expect(await getProfile(db, 'local')).toMatchObject({ username: 'X', lichess: { id: 'x' }, lichessToken: null, chesscom: null });
  });
});
