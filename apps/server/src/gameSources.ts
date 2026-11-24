/** The server's game sources (@e4e5/data gameSources.ts): its configured addresses and User-Agent. */
import type { GameSources } from '@e4e5/data';
import { env } from './env.js';
import { lichessApiQueue } from './lichess.js';

/** With the user's Lichess token, else the app's (higher export rate). */
export const gameSources = (lichessToken?: string | null): GameSources => ({
  chesscomApi: env.chesscomApi,
  lichessHost: env.lichessHost,
  lichessToken: lichessToken ?? env.lichessAppToken,
  headers: { 'User-Agent': 'e4e5' },
  lichessQueue: lichessApiQueue,
});
