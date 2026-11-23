/**
 * The accounts of a user on Lichess and Chess.com, as kept on the device by the app without a
 * server (one user). The server keeps its own (auth.ts: logins, sessions).
 */
import { eq } from 'drizzle-orm';
import { DataError, type Db } from './db.js';
import { chesscomRatings, ChesscomUserNotFound, type GameSources } from './gameSources.js';
import { getAccount } from './lichessAccount.js';
import { users, type ChesscomRatings, type Perfs } from './schema.js';

export interface Profile {
  username: string;
  lichess: { id: string; username: string; perfs: Perfs | null } | null;
  /** The Lichess token (explorer statistics, later the studies), on this device only. */
  lichessToken: string | null;
  chesscom: { username: string; ratings: ChesscomRatings | null } | null;
}

export async function getProfile(db: Db, userId: string): Promise<Profile> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new DataError(404, 'Utilisateur introuvable');
  return {
    username: u.username,
    lichess: u.lichessId ? { id: u.lichessId, username: u.lichessUsername ?? u.lichessId, perfs: u.lichessPerfs ?? null } : null,
    lichessToken: u.lichessToken ?? null,
    chesscom: u.chesscomUsername ? { username: u.chesscomUsername, ratings: u.chesscomRatings ?? null } : null,
  };
}

/**
 * Sets (or with null removes) the Chess.com username, with its current ratings. 400 for an
 * unknown player; Chess.com unreachable: saved without ratings, with a warning.
 */
export async function setChesscom(db: Db, userId: string, username: string | null, src: GameSources): Promise<{ warning?: string }> {
  if (!username) {
    await db.update(users).set({ chesscomUsername: null, chesscomRatings: null }).where(eq(users.id, userId));
    return {};
  }
  let ratings: ChesscomRatings | null = null;
  let warning: string | undefined;
  try {
    ratings = await chesscomRatings(src, username);
  } catch (e) {
    if (e instanceof ChesscomUserNotFound) throw new DataError(400, 'Pseudo Chess.com inconnu');
    warning = 'Chess.com est injoignable : pseudo enregistré, les classements seront récupérés plus tard.';
  }
  await db.update(users).set({ chesscomUsername: username, chesscomRatings: ratings }).where(eq(users.id, userId));
  return { warning };
}

/** Links the Lichess account of a token (read from Lichess), the user named after it. */
export async function linkLichess(db: Db, userId: string, token: string, src: GameSources): Promise<void> {
  const account = await getAccount(src, token);
  await db
    .update(users)
    .set({
      username: account.username,
      lichessId: account.id.toLowerCase(),
      lichessUsername: account.username,
      lichessToken: token,
      lichessPerfs: account.perfs ?? null,
    })
    .where(eq(users.id, userId));
}

export async function unlinkLichess(db: Db, userId: string): Promise<void> {
  await db.update(users).set({ lichessId: null, lichessUsername: null, lichessToken: null, lichessPerfs: null }).where(eq(users.id, userId));
}

/** The accounts of another copy (the server's, without its Lichess token), replacing these. */
export async function copyAccounts(
  db: Db,
  userId: string,
  from: { username: string; lichess: { username: string; perfs: Perfs | null } | null; chesscom: { username: string; ratings: ChesscomRatings | null } | null },
): Promise<void> {
  const [u] = await db.select({ lichessId: users.lichessId, lichessToken: users.lichessToken }).from(users).where(eq(users.id, userId));
  const lichessId = from.lichess?.username.toLowerCase() ?? null;
  await db
    .update(users)
    .set({
      username: from.username,
      lichessId,
      lichessUsername: from.lichess?.username ?? null,
      lichessPerfs: from.lichess?.perfs ?? null,
      // The token of this device is kept if it is the same Lichess account.
      lichessToken: lichessId && u?.lichessId === lichessId ? u.lichessToken : null,
      chesscomUsername: from.chesscom?.username ?? null,
      chesscomRatings: from.chesscom?.ratings ?? null,
    })
    .where(eq(users.id, userId));
}
