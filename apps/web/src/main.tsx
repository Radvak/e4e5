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
    // Changes need the server: offline they fail at once with a message, instead of waiting.
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
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SettingsProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
