/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Where the app is served: / (dev, mobile app), /e4e5/ on GitHub Pages (VITE_BASE).
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  // SQLite (local mode) loads its own .wasm file: left out of Vite's dependency pre-bundling.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  // Tests in French (test-setup.ts).
  test: { setupFiles: ['src/test-setup.ts'] },
  server: { port: 5173 },
});
