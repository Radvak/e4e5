import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { env } from '../env.js';
import { MIGRATIONS_DIR } from '../paths.js';
import * as schema from './schema.js';

if (env.databaseUrl.startsWith('file:')) {
  mkdirSync(dirname(resolve(env.databaseUrl.slice('file:'.length))), { recursive: true });
}

const client = createClient({ url: env.databaseUrl });
export const db = drizzle(client, { schema });

export async function runMigrations() {
  await client.execute('PRAGMA foreign_keys = ON');
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
