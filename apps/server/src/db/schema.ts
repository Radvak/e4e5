import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date());

/** One row per Lichess account (id = lowercase Lichess username). */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  /** Null for guest accounts (no Lichess link). */
  lichessToken: text('lichess_token'),
  /** Lichess `perfs` object (ratings per speed), refreshed at each login. */
  perfs: text('perfs', { mode: 'json' }).$type<Record<string, { rating: number; games: number; prov?: boolean }>>(),
  createdAt: createdAt(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

export const repertoires = sqliteTable(
  'repertoires',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color', { enum: ['white', 'black'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('repertoires_user').on(t.userId)],
);

export const repMoves = sqliteTable(
  'rep_moves',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repertoireId: text('repertoire_id').notNull().references(() => repertoires.id, { onDelete: 'cascade' }),
    fromFen: text('from_fen').notNull(),
    toFen: text('to_fen').notNull(),
    uci: text('uci').notNull(),
    san: text('san').notNull(),
    comment: text('comment'),
    nags: text('nags', { mode: 'json' }).$type<number[]>(),
    isMain: integer('is_main', { mode: 'boolean' }).notNull().default(false),
    source: text('source', { enum: ['manual', 'pgn', 'game', 'explorer'] }).notNull().default('manual'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('rep_moves_unique').on(t.repertoireId, t.fromFen, t.uci),
    index('rep_moves_repertoire').on(t.repertoireId),
  ],
);

/** Explorer answers shared by all users (saves Lichess rate limit). */
export const explorerCache = sqliteTable('explorer_cache', {
  key: text('key').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type RepMoveRow = typeof repMoves.$inferSelect;
