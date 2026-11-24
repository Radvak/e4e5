/**
 * Running in the mobile app (Capacitor) rather than a browser: local mode only (no server), no
 * service worker, Lichess OAuth back through the app's own address (see local/lichessLogin.ts).
 */
import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * No server at all: the mobile app, or a build for static hosting (GitHub Pages, VITE_SERVERLESS=1).
 * Local mode only; the statistics come from the files published next to the app.
 */
export const isServerless = (): boolean => isNative() || import.meta.env.VITE_SERVERLESS === '1';

/** The app's address Lichess sends back to after OAuth (declared in the Android and iOS projects). */
export const NATIVE_CALLBACK = 'com.e4e5://lichess-callback';
