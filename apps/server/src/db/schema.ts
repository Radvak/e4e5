import type { ExplorerResponse } from '@prepa-cahier/core';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date());

export type Perfs = Record<string, { rating: number; games: number; prov?: boolean }>;
/** Ratings from the Chess.com API, e.g. { rapid: 1450, blitz: 1320 }. */
export type ChesscomRatings = Partial<Record<'rapid' | 'blitz' | 'bullet' | 'daily', number>>;

/**
 * An app account. It can be reached by password (`login` + `passwordHash`), by Lichess OAuth
 * (`lichessId`), or both. Guests have `login` = "guest:<name>" and no password.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  /** Display name. */
  username: text('username').notNull(),
  /** Lowercase login name for password accounts (and "guest:<name>" for guests). */
  login: text('login').unique(),
  passwordHash: text('password_hash'),
  lichessId: text('lichess_id').unique(),
  lichessUsername: text('lichess_username'),
  lichessToken: text('lichess_token'),
  /** Lichess `perfs` (ratings per speed), refreshed at each Lichess login. */
  lichessPerfs: text('lichess_perfs', { mode: 'json' }).$type<Perfs>(),
  chesscomUsername: text('chesscom_username'),
  chesscomRatings: text('chesscom_ratings', { mode: 'json' }).$type<ChesscomRatings>(),
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

/**
 * Spaced-repetition state (FSRS) of a position to train: a position of the repertoire where it
 * is the user's turn. Positions without a row are "new".
 */
export const reviewCards = sqliteTable(
  'review_cards',
  {
    repertoireId: text('repertoire_id').notNull().references(() => repertoires.id, { onDelete: 'cascade' }),
    fen: text('fen').notNull(),
    /** ts-fsrs Card, as JSON. */
    card: text('card', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    due: integer('due', { mode: 'timestamp_ms' }).notNull(),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    createdAt: createdAt(),
    lastReview: integer('last_review', { mode: 'timestamp_ms' }),
  },
  (t) => [primaryKey({ columns: [t.repertoireId, t.fen] }), index('review_cards_due').on(t.repertoireId, t.due)],
);

/**
 * Lichess explorer statistics of a position for one combination of speeds and rating buckets,
 * shared by all users. Filled by live explorer requests and by imported seeds; it only grows.
 */
export const positionStats = sqliteTable(
  'position_stats',
  {
    /** Position key (FEN without move counters, see core fenKey). */
    fen: text('fen').notNull(),
    /** Sorted, comma-separated: "blitz,rapid". */
    speeds: text('speeds').notNull(),
    /** Sorted, comma-separated rating buckets: "1600,1800". */
    ratings: text('ratings').notNull(),
    data: text('data', { mode: 'json' }).$type<ExplorerResponse>().notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
    source: text('source', { enum: ['lichess', 'seed', 'import'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.fen, t.speeds, t.ratings] })],
);

/** Seed files of `seed/` already imported into position_stats. */
export const seedImports = sqliteTable('seed_imports', {
  name: text('name').primaryKey(),
  importedAt: integer('imported_at', { mode: 'timestamp_ms' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type RepMoveRow = typeof repMoves.$inferSelect;
