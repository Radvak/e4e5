/**
 * The database the data functions work on: any asynchronous Drizzle SQLite database with the
 * app's schema. The server passes its libsql database; the app (no server) passes SQLite running
 * on the device, through Drizzle's sqlite-proxy driver.
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<'async', any, typeof schema>;

/**
 * An expected failure (bad input, missing row), with the HTTP status the server answers. The
 * server's error handler sends `statusCode` and the message as is.
 */
export class DataError extends Error {
  constructor(
    public statusCode: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'DataError';
  }
}

/** A new id for a row (repertoire, ...). */
export const newId = (): string => crypto.randomUUID();
