/** Played games: sync from Lichess / Chess.com, comparison with the repertoires, inbox. */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { games, gameSyncs, inboxDismissed } from '../db/schema.js';
import { analyseGames, loadRepertoires, type GameReport } from '../gameAnalysis.js';
import { startSync, syncJobs } from '../gamesync.js';

const reportQuery = z.object({
  /** Games of the last `days` days (0: all). */
  days: z.coerce.number().int().min(0).max(3650).default(90),
  speeds: z
    .string()
    .default('blitz,rapid,classical,daily')
    .transform((s) => s.split(',').filter(Boolean)),
});
const MAX_ITEMS = 40;

type Results = { win: number; draw: number; loss: number };
const emptyResults = (): Results => ({ win: 0, draw: 0, loss: 0 });

interface InboxItem {
  key: string;
  kind: 'novelty' | 'deviation' | 'end';
  repertoireId: string;
  fen: string;
  /** Moves from the start to `fen`. */
  line: { sans: string[]; ucis: string[] };
  /** Opponent's novelty, my deviation, or the move played after the end of the line. */
  move: { san: string; uci: string };
  games: number;
  results: Results;
  /** My answers after the opponent's move (novelty, end of line), most played first. */
  replies: { san: string; uci: string; games: number; results: Results }[];
  /** My prepared moves (deviation). */
  expected: string[];
  lastPlayedAt: string;
  example: string;
}

export async function gameRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  /** Accounts, last syncs, running jobs, games stored. */
  app.get('/api/games/sync', async (req) => {
    const user = req.user!;
    const [syncs, counts] = await Promise.all([
      db.select().from(gameSyncs).where(eq(gameSyncs.userId, user.id)),
      db
        .select({ source: games.source, n: sql<number>`count(*)` })
        .from(games)
        .where(eq(games.userId, user.id))
        .groupBy(games.source),
    ]);
    return {
      accounts: { chesscom: user.chesscomUsername ?? null, lichess: user.lichessUsername ?? null },
      syncs: syncs.map((s) => ({ source: s.source, account: s.account, lastGameAt: s.lastGameAt?.toISOString() ?? null, syncedAt: s.syncedAt.toISOString() })),
      counts: Object.fromEntries(counts.map((c) => [c.source, Number(c.n)])),
      jobs: syncJobs(user.id),
    };
  });

  /** Starts a sync in the background (see GET for its progress). */
  app.post('/api/games/sync', async (req, reply) => {
    const { source } = z.object({ source: z.enum(['chesscom', 'lichess']) }).parse(req.body);
    const user = req.user!;
    if (source === 'chesscom' && !user.chesscomUsername) return reply.code(409).send({ error: 'Set your Chess.com username in Settings' });
    if (source === 'lichess' && !user.lichessUsername) return reply.code(409).send({ error: 'Link your Lichess account in Settings' });
    return startSync(user, source, req.log);
  });

  /** Statistics per repertoire, games outside the repertoires, inbox and recent games. */
  app.get('/api/games/report', async (req) => {
    const q = reportQuery.parse(req.query);
    const userId = req.user!.id;
    const where = [eq(games.userId, userId), inArray(games.speed, q.speeds)];
    if (q.days) where.push(gte(games.playedAt, new Date(Date.now() - q.days * 86_400_000)));
    const [rows, reps, dismissed] = await Promise.all([
      db.select().from(games).where(and(...where)).orderBy(games.playedAt),
      loadRepertoires(userId),
      db.select({ key: inboxDismissed.key }).from(inboxDismissed).where(eq(inboxDismissed.userId, userId)),
    ]);
    const reports = analyseGames(rows, reps);
    const hidden = new Set(dismissed.map((d) => d.key));

    // Per repertoire (and outside them, per colour and first move of mine).
    const perRep = new Map<string, { games: number; results: Results; plies: number }>();
    const outside = new Map<string, { color: string; move: string; games: number; results: Results }>();
    const inbox = new Map<string, InboxItem>();
    for (const r of reports) {
      const result = r.game.result;
      if (r.repertoireId === null) {
        const move = r.played ? lineText([...r.path, r.played].map((m) => m.san)) : '—';
        const key = `${r.game.color}|${move}`;
        const o = outside.get(key) ?? { color: r.game.color, move, games: 0, results: emptyResults() };
        o.games++;
        o.results[result]++;
        outside.set(key, o);
        continue;
      }
      const s = perRep.get(r.repertoireId) ?? { games: 0, results: emptyResults(), plies: 0 };
      s.games++;
      s.results[result]++;
      s.plies += r.ply;
      perRep.set(r.repertoireId, s);
      addToInbox(inbox, r, hidden);
    }

    const byGames = (a: InboxItem, b: InboxItem) => b.games - a.games || b.lastPlayedAt.localeCompare(a.lastPlayedAt);
    const items = [...inbox.values()].sort(byGames);
    return {
      games: rows.length,
      repertoires: reps.map((r) => {
        const s = perRep.get(r.id);
        return { id: r.id, games: s?.games ?? 0, results: s?.results ?? emptyResults(), bookMoves: s?.games ? s.plies / s.games / 2 : 0 };
      }),
      outside: [...outside.values()].sort((a, b) => b.games - a.games),
      inbox: {
        novelties: items.filter((i) => i.kind === 'novelty').slice(0, MAX_ITEMS),
        deviations: items.filter((i) => i.kind === 'deviation').slice(0, MAX_ITEMS),
        ends: items.filter((i) => i.kind === 'end').slice(0, MAX_ITEMS),
      },
      recent: reports
        .slice(-30)
        .reverse()
        .map((r) => ({
          id: r.game.id,
          url: r.game.url,
          playedAt: r.game.playedAt.toISOString(),
          color: r.game.color,
          result: r.game.result,
          speed: r.game.speed,
          opponent: r.game.opponent,
          opponentRating: r.game.opponentRating,
          repertoireId: r.repertoireId,
          kind: r.kind,
          ply: r.ply,
          move: r.played ? { san: r.played.san, uci: r.played.uci } : null,
          ucis: r.game.moves.length ? [...r.path.map((m) => m.uci), ...(r.played ? [r.played.uci] : [])] : [],
        })),
    };
  });

  /** Hides an inbox item (dealt with, or not interesting). */
  app.post('/api/games/inbox/dismiss', async (req) => {
    const { key } = z.object({ key: z.string().min(3).max(300) }).parse(req.body);
    await db.insert(inboxDismissed).values({ userId: req.user!.id, key }).onConflictDoNothing();
    return { ok: true };
  });

  /** Shows the dismissed inbox items again. */
  app.delete('/api/games/inbox/dismiss', async (req) => {
    await db.delete(inboxDismissed).where(eq(inboxDismissed.userId, req.user!.id));
    return { ok: true };
  });
}

/** "1. e4 c6" */
const lineText = (sans: string[]) => sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');

const KINDS = { 'opponent-novelty': 'novelty', 'my-deviation': 'deviation', 'end-of-prep': 'end' } as const;

/** Groups the games by the place they left the repertoire. */
function addToInbox(inbox: Map<string, InboxItem>, r: GameReport, hidden: Set<string>) {
  if (!(r.kind in KINDS) || !r.played || !r.repertoireId) return;
  const kind = KINDS[r.kind as keyof typeof KINDS];
  const key = `${kind}|${r.repertoireId}|${r.fen}|${r.played.uci}`;
  if (hidden.has(key)) return;
  let item = inbox.get(key);
  if (!item) {
    item = {
      key,
      kind,
      repertoireId: r.repertoireId,
      fen: r.fen,
      line: { sans: r.path.map((m) => m.san), ucis: r.path.map((m) => m.uci) },
      move: { san: r.played.san, uci: r.played.uci },
      games: 0,
      results: emptyResults(),
      replies: [],
      expected: r.expected,
      lastPlayedAt: '',
      example: r.game.url,
    };
    inbox.set(key, item);
  }
  item.games++;
  item.results[r.game.result]++;
  const at = r.game.playedAt.toISOString();
  if (at > item.lastPlayedAt) [item.lastPlayedAt, item.example] = [at, r.game.url];
  if (r.reply) {
    let reply = item.replies.find((x) => x.uci === r.reply!.uci);
    if (!reply) item.replies.push((reply = { san: r.reply.san, uci: r.reply.uci, games: 0, results: emptyResults() }));
    reply.games++;
    reply.results[r.game.result]++;
    item.replies.sort((a, b) => b.games - a.games);
  }
}
