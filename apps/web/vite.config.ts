import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Changes with every build: drops the data kept offline when the app changes (offline/persist.ts).
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) },
  server: {
    port: 5173,
    // Same origin for the API in dev: cookies and the OAuth redirect go through Vite.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
