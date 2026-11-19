import { useSyncExternalStore } from 'react';
import { pendingReviews, subscribePending } from './reviews';

const subscribeOnline = (f: () => void) => {
  window.addEventListener('online', f);
  window.addEventListener('offline', f);
  return () => {
    window.removeEventListener('online', f);
    window.removeEventListener('offline', f);
  };
};

/** The device has a network connection (as the browser knows it). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/** Training answers of the user not sent to the server yet. */
export function usePendingReviews(): number {
  return useSyncExternalStore(subscribePending, pendingReviews);
}
