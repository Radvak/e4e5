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
  databaseUrl: get('DATABASE_URL', 'file:./data/prepa-cahier.db'),
  cookieSecret: get('COOKIE_SECRET', isProd ? undefined : 'dev-secret-change-me-dev-secret-change-me'),
  lichessHost: get('LICHESS_HOST', 'https://lichess.org'),
  lichessClientId: get('LICHESS_CLIENT_ID', 'prepa-cahier'),
  explorerUrl: get('EXPLORER_URL', 'https://explorer.lichess.ovh'),
  /** Login with just a name, without Lichess (testing, or networks where Lichess is blocked). */
  guestLogin: get('GUEST_LOGIN', isProd ? 'false' : 'true') === 'true',
};
