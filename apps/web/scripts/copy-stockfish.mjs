// Copies the Stockfish WASM engine (lite, single-threaded: no cross-origin isolation needed)
// from node_modules to public/stockfish/, where the browser loads it as a Web Worker.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve('stockfish/package.json'));
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'stockfish');
mkdirSync(out, { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(pkg, 'bin', file), join(out, file));
}
console.log(`Stockfish copied to ${out}`);
