import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The mobile app (Capacitor): the web app built with VITE_NATIVE=1 (pnpm build:native), in local
 * mode only (no server). Native HTTP for the app's fetch calls: Lichess and Chess.com are reached
 * without the browser's CORS rules. Back from Lichess OAuth through com.e4e5://lichess-callback.
 */
const config: CapacitorConfig = {
  appId: 'com.e4e5',
  appName: 'e4e5',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
