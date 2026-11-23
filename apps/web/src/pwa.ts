/**
 * Installable app (PWA): service worker registration and the "install" prompt.
 *
 * - registerServiceWorker: production builds only (in dev, Vite serves the files and a cache
 *   would get in the way).
 * - useInstall: whether the app already runs installed, and how to install it here: Chrome /
 *   Edge / Android give an install prompt (beforeinstallprompt), iOS Safari only has
 *   Share → "Sur l’écran d’accueil". Offered once, on the first visit from a phone
 *   (components/InstallPrompt.tsx).
 */
import { useEffect, useState } from 'react';
import { isNative } from './native';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function registerServiceWorker() {
  // The mobile app ships its files: no service worker, nothing to install.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || isNative()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker not registered', e));
  });
  // Chrome fires this early, possibly before the settings page is open: keep it for later.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const mobile = () => ios() || /android|mobile/i.test(navigator.userAgent);

export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return {
    installed: standalone(),
    canPrompt: deferred !== null,
    ios: ios(),
    mobile: mobile(),
    prompt: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      notify();
    },
  };
}
