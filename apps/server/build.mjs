// Compiles the server to one JavaScript file (dist/index.js), so production starts with plain
// `node` instead of compiling TypeScript at boot (tsx): much faster start (machine wake-up).
import { build } from 'esbuild';

// Everything is bundled (one file to load at boot: much faster on a small machine than
// thousands of node_modules files), except the native SQLite driver.
const external = ['@libsql/*', 'libsql'];

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  // CommonJS dependencies bundled into an ES module still call require().
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
});
