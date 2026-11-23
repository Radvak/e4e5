/**
 * Running in the mobile app (Capacitor) rather than a browser: local mode only (no server), no
 * service worker, Lichess OAuth back through the app's own address (see local/lichessLogin.ts).
 */
import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** The app's address Lichess sends back to after OAuth (declared in the Android and iOS projects). */
export const NATIVE_CALLBACK = 'com.tabiya://lichess-callback';
