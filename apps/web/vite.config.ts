import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same origin for the API in dev: cookies and the OAuth redirect go through Vite.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
