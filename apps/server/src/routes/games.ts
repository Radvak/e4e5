/**
 * Played games: sync from Lichess / Chess.com, comparison with the repertoires, inbox. The rules
 * are in @tabiya/data (gameSync.ts, gamesReport.ts), shared with the app running without a
 * server: these routes check the requests.
 */
import { dismissInbox, gamesReport, restoreInbox, startSync, syncStatus } from '@tabiya/data';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db/client.js';
import { gameSources } from '../gameSources.js';

const reportQuery = z.object({
  /** Games of the last `days` days (0: all). */
  days: z.coerce.number().int().min(0).max(3650).default(90),
  speeds: z
    .string()
    .default('blitz,rapid,classical')
    .transform((s) => s.split(',').filter(Boolean)),
});

export async function gameRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  /** Accounts, last syncs, running jobs, games stored. */
  app.get('/api/games/sync', async (req) => syncStatus(db, req.user!));

  /** Starts a sync in the background (see GET for its progress). */
  app.post('/api/games/sync', async (req) => {
    const { source } = z.object({ source: z.enum(['chesscom', 'lichess']) }).parse(req.body);
    const user = req.user!;
    return startSync(db, user, source, gameSources(user.lichessToken), (e) => req.log.warn({ err: e }, `${source} sync failed`));
  });

  /** Statistics per repertoire, games outside the repertoires, inbox and recent games. */
  app.get('/api/games/report', async (req) => gamesReport(db, req.user!.id, reportQuery.parse(req.query)));

  /** Hides an inbox item (dealt with, or not interesting). */
  app.post('/api/games/inbox/dismiss', async (req) =>
    dismissInbox(db, req.user!.id, z.object({ key: z.string().min(3).max(300) }).parse(req.body).key),
  );

  /** Shows the dismissed inbox items again. */
  app.delete('/api/games/inbox/dismiss', async (req) => restoreInbox(db, req.user!.id));
}
