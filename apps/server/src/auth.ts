/** "Login with Lichess" (OAuth2 + PKCE) and cookie sessions. */
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from './db/client.js';
import { sessions, users, type User } from './db/schema.js';
import { env } from './env.js';
import { exchangeCode, getAccount } from './lichess.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

const SESSION_COOKIE = 'sid';
const OAUTH_COOKIE = 'oauth';
const SESSION_DAYS = 30;
const guestBody = z.object({ username: z.string().trim().regex(/^[\w-]{2,30}$/, 'Letters, digits, - and _ only') });
const redirectUri = () => `${env.publicUrl}/api/auth/callback`;
const b64url = (buf: Buffer) => buf.toString('base64url');
const secure = env.publicUrl.startsWith('https://');

export async function authRoutes(app: FastifyInstance) {
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
      if (error || !code || !unsigned?.valid || !unsigned.value) {
        return reply.redirect(`${env.publicUrl}/?login=failed`);
      }
      const saved = JSON.parse(unsigned.value) as { verifier: string; state: string };
      if (saved.state !== state) return reply.redirect(`${env.publicUrl}/?login=failed`);

      const token = await exchangeCode(code, saved.verifier, redirectUri());
      const account = await getAccount(token);
      const id = account.id.toLowerCase();
      await db
        .insert(users)
        .values({ id, username: account.username, lichessToken: token, perfs: account.perfs ?? null })
        .onConflictDoUpdate({
          target: users.id,
          set: { username: account.username, lichessToken: token, perfs: account.perfs ?? null },
        });

      await startSession(reply, id);
      return reply.redirect(`${env.publicUrl}/`);
    },
  );

  app.get('/api/auth/config', async () => ({ guestLogin: env.guestLogin }));

  /** Guest login: just a name, no Lichess (disabled unless GUEST_LOGIN=true). */
  app.post('/api/auth/guest', async (req, reply) => {
    if (!env.guestLogin) return reply.code(404).send({ error: 'Guest login disabled' });
    const { username } = guestBody.parse(req.body);
    const id = `guest-${username.toLowerCase()}`;
    await db.insert(users).values({ id, username }).onConflictDoNothing();
    await startSession(reply, id);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const sid = sessionId(req);
    if (sid) await db.delete(sessions).where(eq(sessions.id, sid));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requireUser }, async (req) => {
    const { id, username, perfs, lichessToken } = req.user!;
    return { id, username, perfs, lichess: !!lichessToken };
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

/** preHandler: 401 unless a valid session cookie is present; sets `req.user`. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const sid = sessionId(req);
  if (sid) {
    const rows = await db
      .select({ user: users, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sid));
    const row = rows[0];
    if (row && row.expiresAt.getTime() > Date.now()) {
      req.user = row.user;
      return;
    }
  }
  return reply.code(401).send({ error: 'Not logged in' });
}
