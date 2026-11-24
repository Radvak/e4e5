/**
 * The API methods answered by the local database (no server), with the shared data functions
 * (@e4e5/data). Same answers as the server's, JSON included (dates as ISO strings), so the
 * pages see no difference. The repertoires, the training and the played games for now: the
 * other methods still go to the server (see mode.ts).
 *
 * One user, without login: its accounts on Lichess (linked by OAuth from the app, lichessLogin.ts)
 * and Chess.com are kept in the local database; its games are synced from the device, straight
 * from the two sites.
 *
 * The statistics (explorer, search at my level, missing moves) are read in the files downloaded
 * on the device (stats.ts) when every rating bucket of the settings is there; otherwise, and for
 * a position not in the files, the server answers as before.
 */
import { fenKey, positionFromFen, REACH_STEPS, suggestMoves } from '@e4e5/core';
import {
  createRepertoire,
  DataError,
  deleteMove,
  deleteRepertoire,
  dismissInbox,
  gamesReport,
  gapsAnalysis,
  getRepertoire,
  importPgn,
  getStudy,
  StudyError,
  studiesBy,
  copyAccounts,
  getProfile,
  setChesscom,
  unlinkLichess,
  myGameMoves,
  myGamesAt,
  openingOfUcis,
  PUBLIC_SOURCES,
  restoreInbox,
  setOpeningsTable,
  startSync,
  syncStatus,
  listCards,
  listRepertoires,
  positionRepertoires,
  recordAnswer,
  repertoireMovesAt,
  reviewNow,
  saveLine,
  updateMove,
  updateRepertoire,
} from '@e4e5/data';
import { moveCards, repertoires, repMoves, users } from '@e4e5/data/schema';
import { eq } from 'drizzle-orm';
import { ApiError, serverApi, UNREACHABLE, type api, type Me, type RepertoireDetail, type RepertoireSummary, type ReviewCard } from '../api';
import { LOCAL_USER, localDb } from './db';
import type { LocalMethod } from './mode';
import { isServerless } from '../native';
import { localStats } from './stats';
import { t } from '../i18n';

type Api = typeof api;
type LocalDb = Awaited<ReturnType<typeof localDb>>['db'];

/** Runs a data function on the local database, answering like the server would. */
async function run<T>(fn: (db: LocalDb) => Promise<unknown>): Promise<T> {
  let result: unknown;
  try {
    result = await fn((await localDb()).db);
  } catch (e) {
    if (e instanceof DataError) throw new ApiError(e.statusCode, e.message);
    if (e instanceof StudyError) throw new ApiError(e.status, e.message);
    throw new ApiError(500, e instanceof Error ? e.message : String(e));
  }
  // Through JSON, as from the server: dates become strings, undefined fields disappear.
  return JSON.parse(JSON.stringify(result)) as T;
}

/** The user of this device, as the app sees it (the server's Me). */
async function localMe(db: LocalDb): Promise<Me> {
  const p = await getProfile(db, LOCAL_USER);
  return {
    id: LOCAL_USER,
    username: p.username,
    guest: false,
    hasPassword: false,
    login: null,
    lichess: p.lichess && { username: p.lichess.username, perfs: p.lichess.perfs },
    chesscom: p.chesscom,
    explorer: !!p.lichessToken,
    local: true,
  };
}

/** lichess.org calls of the device, one at a time (Lichess answers 429 to a second one). */
let lichessCalls: Promise<unknown> = Promise.resolve();
const lichessQueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = lichessCalls.then(task);
  lichessCalls = run.catch(() => undefined);
  return run;
};
/** The sites as the device reaches them (public addresses, no custom header). */
const SOURCES = { ...PUBLIC_SOURCES, lichessQueue };

/** The sites with the Lichess token of the device's account, if linked: its private studies too. */
async function withLichessToken(db: LocalDb) {
  const [u] = await db.select({ token: users.lichessToken }).from(users).where(eq(users.id, LOCAL_USER));
  return { ...SOURCES, lichessToken: u?.token ?? null };
}

/** The local user with its accounts. */
async function localUser(db: LocalDb) {
  const [u] = await db.select().from(users).where(eq(users.id, LOCAL_USER));
  return { id: LOCAL_USER, chesscomUsername: u?.chesscomUsername ?? null, lichessUsername: u?.lichessUsername ?? null };
}

/** The table of opening names, loaded with the code the first time it is needed (~100 Ko). */
let openings: Promise<void> | null = null;
const loadOpenings = () =>
  (openings ??= import('../../../server/seed/openings.tsv?raw').then((m) => setOpeningsTable(() => m.default)));

/**
 * A statistics answer of the server, when the device has not got it (files not downloaded,
 * position not in them). Not signed in on the server: says what to download instead.
 */
async function fromServer<T>(call: () => Promise<T>): Promise<T> {
  try {
    // No server (mobile app, static hosting).
    if (isServerless()) throw new ApiError(UNREACHABLE, t('Pas de serveur', 'No server'));
    return await call();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === UNREACHABLE)) {
      const message = t(
        'Statistiques absentes de cet appareil : téléchargez les tranches de vos réglages (Paramètres › Mode local)',
        'Statistics not on this device: download the ranges of your settings (Settings › Local mode)',
      );
      throw new ApiError(404, message, {
        reason: 'local-stats',
      });
    }
    throw e;
  }
}

const positionKey = (fen: string) => {
  try {
    return fenKey(positionFromFen(fen));
  } catch {
    throw new DataError(400, t('FEN invalide', 'Invalid FEN'));
  }
};

export const localApi = {
  /** The user of this device and its accounts (no login). */
  me: () => run(async (db) => localMe(db)),
  updateMe: (patch) =>
    run(async (db) => {
      if (patch.password) throw new DataError(400, t('Pas de mot de passe en mode local : le compte est sur cet appareil', 'No password in local mode: the account is on this device'));
      const { warning } = patch.chesscomUsername !== undefined ? await setChesscom(db, LOCAL_USER, patch.chesscomUsername, PUBLIC_SOURCES) : {};
      return { user: await localMe(db), warning };
    }),
  unlinkLichess: () =>
    run(async (db) => {
      await unlinkLichess(db, LOCAL_USER);
      return { user: await localMe(db) };
    }),
  logout: () => Promise.reject(new ApiError(400, t('Pas de déconnexion en mode local : désactivez-le dans Paramètres', 'No sign-out in local mode: turn it off in Settings'))),
  repertoires: () => run(async (db) => listRepertoires(db, LOCAL_USER)),
  createRepertoire: (name, color) => run(async (db) => createRepertoire(db, LOCAL_USER, { name: name.trim(), color })),
  renameRepertoire: (id, name) => run(async (db) => updateRepertoire(db, LOCAL_USER, id, { name: name.trim() })),
  setRepertoireActive: (id, active) => run(async (db) => updateRepertoire(db, LOCAL_USER, id, { active })),
  deleteRepertoire: (id) => run(async (db) => deleteRepertoire(db, LOCAL_USER, id)),
  repertoire: (id) => run(async (db) => getRepertoire(db, LOCAL_USER, id)),
  saveLine: (id, ucis) => run(async (db) => saveLine(db, LOCAL_USER, id, ucis)),
  updateMove: (id, moveId, patch) => run(async (db) => updateMove(db, LOCAL_USER, id, moveId, patch)),
  deleteMove: (id, moveId) => run(async (db) => deleteMove(db, LOCAL_USER, id, moveId)),
  importPgn: (id, pgn) => run(async (db) => importPgn(db, LOCAL_USER, id, pgn)),
  positionRepertoires: (fen) => run(async (db) => positionRepertoires(db, LOCAL_USER, fen)),
  repertoireMovesAt: (fen) => run(async (db) => repertoireMovesAt(db, LOCAL_USER, fen)),
  cards: () => run(async (db) => listCards(db, LOCAL_USER)),
  review: (id, answer) => run(async (db) => recordAnswer(db, LOCAL_USER, id, answer)),
  reviewNow: (id, fen) => run(async (db) => reviewNow(db, LOCAL_USER, id, fen)),
  syncState: () => run(async (db) => syncStatus(db, await localUser(db))),
  startSync: (source) => run(async (db) => startSync(db, await localUser(db), source, SOURCES, (e) => console.warn(`${source} sync failed`, e))),
  gamesReport: (days, speeds) =>
    run(async (db) => {
      await loadOpenings();
      return gamesReport(db, LOCAL_USER, { days, speeds });
    }),
  dismissInbox: (key) => run(async (db) => dismissInbox(db, LOCAL_USER, key)),
  restoreInbox: () => run(async (db) => restoreInbox(db, LOCAL_USER)),
  myGames: (fen, color, speeds, days) =>
    run(async (db) => {
      const u = await localUser(db);
      return myGamesAt(db, LOCAL_USER, { lichess: u.lichessUsername, chesscom: u.chesscomUsername }, { fen: positionKey(fen), color, speeds, days });
    }),
  myGameMoves: (id) =>
    run(async (db) => {
      const moves = await myGameMoves(db, LOCAL_USER, id);
      if (!moves) throw new DataError(404, t('Partie introuvable', 'Game not found'));
      return { moves };
    }),
  explorer: async (fen, speeds, ratings) => {
    const s = await localStats(speeds, ratings);
    const data = s && (await s.one(positionKey(fen)));
    if (!s || !data) return fromServer(() => serverApi.explorer(fen, speeds, ratings));
    const meta = { speeds, ratings, exact: true, fetchedAt: new Date(`${s.period.until}-01T00:00:00Z`).toISOString(), source: 'database' as const, period: s.period };
    return { data, meta };
  },
  bestMoves: async (fen, speeds, ratings, depth, color) => {
    const s = await localStats(speeds, ratings);
    const root = positionKey(fen);
    const first = s && (await s.one(root));
    if (!s || !first) return fromServer(() => serverApi.bestMoves(fen, speeds, ratings, depth, color));
    const { missing: _m, approximate: _a, ...found } = await suggestMoves(s.stored, root, { data: first, exact: true }, depth, color);
    return { ...found, steps: REACH_STEPS, pending: 0 };
  },
  gaps: async (speeds, ratings, cutoff) => {
    const s = await localStats(speeds, ratings);
    if (!s) return fromServer(() => serverApi.gaps(speeds, ratings, cutoff));
    return run(async (db) => gapsAnalysis(db, LOCAL_USER, { speeds, ratings, cutoff }, s.stored));
  },
  lichessStudiesBy: (username) => run(async (db) => studiesBy(await withLichessToken(db), username)),
  lichessStudy: (id) => run(async (db) => getStudy(await withLichessToken(db), id)),
  opening: (line) =>
    run(async () => {
      await loadOpenings();
      const o = openingOfUcis(line ? line.split(',') : []);
      return o && { eco: o.eco, name: o.name };
    }),
} satisfies Pick<Api, LocalMethod>;

/**
 * Replaces the local repertoires, training progress and accounts with a copy of the server's,
 * same ids (the features still answered by the server find them). The history of the answers and
 * the Lichess token stay on the server (link Lichess again on the device). Answers the number of repertoires, moves and move cards copied.
 */
export async function copyFromServer(
  remote: Pick<Api, 'me' | 'repertoires' | 'repertoire' | 'cards'>,
): Promise<{ repertoires: number; moves: number; cards: number }> {
  const me = await remote.me();
  const list: RepertoireSummary[] = await remote.repertoires();
  const details: RepertoireDetail[] = [];
  for (const r of list) details.push(await remote.repertoire(r.id));
  const cards: ReviewCard[] = await remote.cards();
  const { db } = await localDb();
  await copyAccounts(db, LOCAL_USER, me);
  await db.delete(moveCards).where(eq(moveCards.userId, LOCAL_USER));
  const mine = await db.select({ id: repertoires.id }).from(repertoires).where(eq(repertoires.userId, LOCAL_USER));
  for (const r of mine) {
    await db.delete(repMoves).where(eq(repMoves.repertoireId, r.id));
    await db.delete(repertoires).where(eq(repertoires.id, r.id));
  }
  let moves = 0;
  for (const d of details) {
    await db.insert(repertoires).values({ id: d.id, userId: LOCAL_USER, name: d.name, color: d.color, active: d.active, createdAt: new Date(d.createdAt) });
    for (let i = 0; i < d.moves.length; i += 500) {
      await db.insert(repMoves).values(
        d.moves.slice(i, i + 500).map((m) => ({
          id: m.id,
          repertoireId: d.id,
          fromFen: m.fromFen,
          toFen: m.toFen,
          uci: m.uci,
          san: m.san,
          comment: m.comment ?? null,
          nags: m.nags?.length ? m.nags : null,
          isMain: !!m.isMain,
          paused: !!m.paused,
          source: m.source as 'manual' | 'pgn' | 'game' | 'explorer',
        })),
      );
    }
    moves += d.moves.length;
  }
  for (let i = 0; i < cards.length; i += 500) {
    await db.insert(moveCards).values(
      cards.slice(i, i + 500).map((c) => {
        const last = c.fsrs.last_review;
        return {
          userId: LOCAL_USER,
          fen: c.fen,
          uci: c.uci,
          card: c.fsrs,
          due: new Date(c.due),
          reps: c.reps,
          lapses: c.lapses,
          createdAt: new Date(c.createdAt),
          lastReview: typeof last === 'string' || typeof last === 'number' ? new Date(last) : null,
        };
      }),
    );
  }
  return { repertoires: details.length, moves, cards: cards.length };
}
