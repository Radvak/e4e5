/**
 * Authentication: password accounts, "Login with Lichess" (OAuth2 + PKCE, also used to link
 * Lichess to an existing account), optional guest login, and cookie sessions.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ChesscomUserNotFound, chesscomRatings } from './chesscom.js';
import { db } from './db/client.js';
import { sessions, users, type User } from './db/schema.js';
import { env } from './env.js';
import { exchangeCode, getAccount } from './lichess.js';
import { hashPassword, verifyPassword } from './password.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

const SESSION_COOKIE = 'sid';
const OAUTH_COOKIE = 'oauth';
const SESSION_DAYS = 30;
const redirectUri = () => `${env.publicUrl}/api/auth/callback`;
const b64url = (buf: Buffer) => buf.toString('base64url');
const secure = env.publicUrl.startsWith('https://');

const loginName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{2,30}$/, 'Username: 2-30 letters, digits, - or _');
const credentials = z.object({
  username: loginName,
  password: z.string().min(8, 'Password: at least 8 characters').max(200),
});
const guestBody = z.object({ username: loginName });
const profileBody = z.object({
  chesscomUsername: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,25}$/, 'Invalid Chess.com username')
    .nullable()
    .optional(),
  password: credentials.shape.password.optional(),
  /** Login name, when a Lichess account adds a password (default: the Lichess username). */
  login: loginName.optional(),
});

/** Public view of the logged-in user. */
export function publicUser(u: User) {
  return {
    id: u.id,
    username: u.username,
    guest: !!u.login?.startsWith('guest:'),
    hasPassword: !!u.passwordHash,
    login: u.login?.startsWith('guest:') ? null : u.login,
    lichess: u.lichessId ? { username: u.lichessUsername ?? u.lichessId, perfs: u.lichessPerfs ?? null } : null,
    chesscom: u.chesscomUsername ? { username: u.chesscomUsername, ratings: u.chesscomRatings ?? null } : null,
    /** Whether explorer statistics are available (own Lichess token or the app token). */
    explorer: !!(u.lichessToken || env.lichessAppToken),
  };
}

/** Very small in-memory limiter against password guessing: 10 attempts / 10 min / IP. */
const attempts = new Map<string, { count: number; resetAt: number }>();
function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/config', async () => ({ guestLogin: env.guestLogin }));

  app.post('/api/auth/register', async (req, reply) => {
    if (tooManyAttempts(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    const { username, password } = credentials.parse(req.body);
    const login = username.toLowerCase();
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.login, login));
    if (taken) return reply.code(409).send({ error: 'This username is taken' });
    const id = randomUUID();
    await db.insert(users).values({ id, username, login, passwordHash: await hashPassword(password) });
    await startSession(reply, id);
    return { ok: true };
  });

  app.post('/api/auth/password', async (req, reply) => {
    if (tooManyAttempts(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    const { username, password } = credentials.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.login, username.toLowerCase()));
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Wrong username or password' });
    }
    await startSession(reply, user.id);
    return { ok: true };
  });

  /** Guest login: just a name, no password (disabled unless GUEST_LOGIN=true). */
  app.post('/api/auth/guest', async (req, reply) => {
    if (!env.guestLogin) return reply.code(404).send({ error: 'Guest login disabled' });
    const { username } = guestBody.parse(req.body);
    const login = `guest:${username.toLowerCase()}`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.login, login));
    const id = existing?.id ?? randomUUID();
    if (!existing) await db.insert(users).values({ id, username, login });
    await startSession(reply, id);
    return { ok: true };
  });

  /** Starts Lichess OAuth. Logged in: links Lichess to the account; otherwise: logs in. */
  app.get('/api/auth/login', async (_req, reply) => {
    const verifier = b64url(randomBytes(32));
    const state = b64url(randomBytes(16));
    reply.setCookie(OAUTH_COOKIE, JSON.stringify({ verifier, state }), {
      signed: true, httpOnly: true, sameSite: 'lax', secure, path: '/api/auth', maxAge: 600,
    });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.lichessClientId,
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: b64url(createHash('sha256').update(verifier).digest()),
      state,
    });
    return reply.redirect(`${env.lichessHost}/oauth?${params}`);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/callback',
    async (req, reply) => {
      const raw = req.cookies[OAUTH_COOKIE];
      const unsigned = raw ? req.unsignCookie(raw) : null;
      reply.clearCookie(OAUTH_COOKIE, { path: '/api/auth' });
      const { code, state, error } = req.query;
      const fail = (reason: string) => reply.redirect(`${env.publicUrl}/?login=${reason}`);
      if (error || !code || !unsigned?.valid || !unsigned.value) return fail('failed');
      const saved = JSON.parse(unsigned.value) as { verifier: string; state: string };
      if (saved.state !== state) return fail('failed');

      const token = await exchangeCode(code, saved.verifier, redirectUri());
      const account = await getAccount(token);
      const lichess = {
        lichessId: account.id.toLowerCase(),
        lichessUsername: account.username,
        lichessToken: token,
        lichessPerfs: account.perfs ?? null,
      };
      const [owner] = await db.select().from(users).where(eq(users.lichessId, lichess.lichessId));
      const current = await currentUser(req);

      if (current) {
        // Linking Lichess to the logged-in account.
        if (owner && owner.id !== current.id) return fail('lichess-already-linked');
        await db.update(users).set(lichess).where(eq(users.id, current.id));
        return reply.redirect(`${env.publicUrl}/settings`);
      }
      if (owner) {
        await db.update(users).set(lichess).where(eq(users.id, owner.id));
        await startSession(reply, owner.id);
      } else {
        const id = randomUUID();
        await db.insert(users).values({ id, username: account.username, ...lichess });
        await startSession(reply, id);
      }
      return reply.redirect(`${env.publicUrl}/`);
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const sid = sessionId(req);
    if (sid) await db.delete(sessions).where(eq(sessions.id, sid));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requireUser }, async (req) => publicUser(req.user!));

  /** Updates the profile: Chess.com username, password (password accounts only). */
  app.patch('/api/me', { preHandler: requireUser }, async (req, reply) => {
    const body = profileBody.parse(req.body);
    const user = req.user!;
    const patch: Partial<User> = {};
    let warning: string | undefined;

    if (body.chesscomUsername === null) {
      patch.chesscomUsername = null;
      patch.chesscomRatings = null;
    } else if (body.chesscomUsername) {
      patch.chesscomUsername = body.chesscomUsername;
      try {
        patch.chesscomRatings = await chesscomRatings(body.chesscomUsername);
      } catch (e) {
        if (e instanceof ChesscomUserNotFound) return reply.code(400).send({ error: 'Unknown Chess.com username' });
        req.log.warn({ err: e }, 'Chess.com unreachable');
        warning = 'Chess.com could not be reached: username saved, ratings will be fetched later.';
      }
    }
    if (body.password) {
      if (user.login?.startsWith('guest:')) return reply.code(400).send({ error: 'Guest accounts cannot have a password' });
      if (!user.login) {
        // A Lichess account adds a password: it also needs a login name, to log in without Lichess.
        const login = (body.login ?? user.lichessUsername ?? '').toLowerCase();
        if (!loginName.safeParse(login).success) return reply.code(400).send({ error: 'Choose a username (2-30 letters, digits, - or _)' });
        const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.login, login));
        if (taken) return reply.code(409).send({ error: `The username “${login}” is taken` });
        patch.login = login;
      }
      patch.passwordHash = await hashPassword(body.password);
    }
    if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, user.id));
    return { user: publicUser({ ...user, ...patch }), warning };
  });

  /** Unlinks Lichess (only if the account can still be reached by password). */
  app.delete('/api/me/lichess', { preHandler: requireUser }, async (req, reply) => {
    const user = req.user!;
    if (!user.passwordHash) return reply.code(400).send({ error: 'Set up a password account first: Lichess is your only login' });
    const patch = { lichessId: null, lichessUsername: null, lichessToken: null, lichessPerfs: null };
    await db.update(users).set(patch).where(eq(users.id, user.id));
    return { user: publicUser({ ...user, ...patch }) };
  });
}

async function startSession(reply: FastifyReply, userId: string) {
  const sid = b64url(randomBytes(32));
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sid, userId, expiresAt });
  reply.setCookie(SESSION_COOKIE, sid, {
    signed: true, httpOnly: true, sameSite: 'lax', secure, path: '/', expires: expiresAt,
  });
}

function sessionId(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

async function currentUser(req: FastifyRequest): Promise<User | null> {
  const sid = sessionId(req);
  if (!sid) return null;
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sid));
  return row && row.expiresAt.getTime() > Date.now() ? row.user : null;
}

/** preHandler: 401 unless a valid session cookie is present; sets `req.user`. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const user = await currentUser(req);
  if (!user) return reply.code(401).send({ error: 'Not logged in' });
  req.user = user;
}
