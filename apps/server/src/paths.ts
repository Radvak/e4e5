/**
 * Folders of the server package (migrations, seeds, built web app), found from the running
 * file: works from the TypeScript sources (src/...) and from the compiled bundle (dist/index.js).
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findServerRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'drizzle')) && existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Server root (with drizzle/) not found');
    dir = parent;
  }
}

export const SERVER_ROOT = findServerRoot();
export const MIGRATIONS_DIR = join(SERVER_ROOT, 'drizzle');
export const SEED_DIR = join(SERVER_ROOT, 'seed');
export const WEB_DIST = resolve(SERVER_ROOT, '../web/dist');
