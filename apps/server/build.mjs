// Compiles the server to one JavaScript file (dist/index.js), so production starts with plain
// `node` instead of compiling TypeScript at boot (tsx): much faster start (machine wake-up).
// The shared core package (TypeScript sources) and its chessops dependency are bundled; the
// server's own dependencies stay in node_modules.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@prepa-cahier/core');

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  logLevel: 'info',
});
