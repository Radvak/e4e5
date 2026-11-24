function get(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  isProd,
  port: Number(get('PORT', '3000')),
  host: get('HOST', isProd ? '0.0.0.0' : '127.0.0.1'),
  /** URL users open in their browser (Vite dev server in development). */
  publicUrl: get('PUBLIC_URL', 'http://localhost:5173').replace(/\/$/, ''),
  databaseUrl: get('DATABASE_URL', 'file:./data/e4e5.db'),
  cookieSecret: get('COOKIE_SECRET', isProd ? undefined : 'dev-secret-change-me-dev-secret-change-me'),
  lichessHost: get('LICHESS_HOST', 'https://lichess.org'),
  lichessClientId: get('LICHESS_CLIENT_ID', 'e4e5'),
  explorerUrl: get('EXPLORER_URL', 'https://explorer.lichess.ovh'),
  /** Login with just a name, without Lichess (testing, or networks where Lichess is blocked). */
  guestLogin: get('GUEST_LOGIN', isProd ? 'false' : 'true') === 'true',
  /**
   * Optional Lichess token of the app owner (https://lichess.org/account/oauth/token, no scope),
   * used for explorer statistics of users who have not linked a Lichess account.
   */
  lichessAppToken: process.env.LICHESS_APP_TOKEN || null,
  chesscomApi: get('CHESSCOM_API', 'https://api.chess.com'),
  /**
   * Secret of a sync tool (outside this repository) to send position statistics computed from Lichess
   * games (shared by every account). Unset: that import is disabled.
   */
  syncToken: process.env.SYNC_TOKEN || null,
  /**
   * Position statistics of the Lichess game database built by tools/stats (build.ts), served
   * before the Lichess explorer; absent file: explorer only.
   */
  statsDb: get('STATS_DB', isProd ? '/data/stats.db' : './data/stats.db'),
  /** The statistics split per rating bucket (scripts/split-stats.ts), downloaded by the app (local mode). */
  statsFilesDir: get('STATS_FILES_DIR', isProd ? '/data/stats-files' : './data/stats-files'),
};
