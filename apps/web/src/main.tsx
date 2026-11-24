// First: the data kept under the app's former name (Tabiya) moves to e4e5's names.
import './legacyNames';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { keepOfflineQueries, persistOptions } from './offline/persist';
import { isNative } from './native';
import { registerServiceWorker } from './pwa';
import { SettingsProvider } from './settings';
import './styles.css';

registerServiceWorker();
// Mobile app: back from Lichess OAuth on the app's own address.
if (isNative()) void import('./local/lichessLogin').then((m) => m.listenForLichessCallback());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
    // Changes run at once, even offline (they are on the device; Lichess calls fail with a message).
    mutations: { networkMode: 'always' },
  },
});
keepOfflineQueries(queryClient);
// TanStack assumes it starts online: opened offline, queries would fail (instead of waiting) and
// nothing would be refetched when the connection comes back.
onlineManager.setOnline(navigator.onLine);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <SettingsProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <App />
        </BrowserRouter>
      </SettingsProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
