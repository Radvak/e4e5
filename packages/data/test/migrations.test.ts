/**
 * The migrations that move existing data, run as the app runs them on a device: each file in
 * the journal's order, with the foreign keys on (local/sqlite.worker.ts).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import { beforeEach, describe, expect, it } from 'vitest';
import journal from '../drizzle/meta/_journal.json' with { type: 'json' };

const dir = fileURLToPath(new URL('../drizzle', import.meta.url));
const sqlOf = (tag: string) => readFileSync(`${dir}/${tag}.sql`, 'utf8').replaceAll('--> statement-breakpoint', '');

/** Runs the migrations from `from` (included) to `to` (excluded), as the app does. */
async function migrate(client: Client, from: string | null, to: string | null) {
  const tags = journal.entries.map((e) => e.tag);
  const start = from ? tags.indexOf(from) : 0;
  const end = to ? tags.indexOf(to) : tags.length;
  for (const tag of tags.slice(start, end)) await client.executeMultiple(sqlOf(tag));
}

const rows = async (client: Client, sql: string) => (await client.execute(sql)).rows.map((r) => ({ ...r }));

describe('0012 chapters', () => {
  let client: Client;
  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    await client.execute('PRAGMA foreign_keys = ON');
    await migrate(client, null, '0012_chapters');
    // Data as before chapters: two repertoires, their moves, history and cards.
    await client.executeMultiple(`
      INSERT INTO users (id, username, created_at) VALUES ('u1', 'Moi', 1);
      INSERT INTO repertoires (id, user_id, name, color, active, source_key, created_at) VALUES
        ('r1', 'u1', 'Sozin', 'black', 1, 'alphaechecs:sicilienne:Sozin', 10),
        ('r2', 'u1', 'Scandinave', 'white', 0, NULL, 20);
      INSERT INTO rep_moves (id, repertoire_id, from_fen, to_fen, uci, san, is_main, paused, source, created_at) VALUES
        (1, 'r1', 'a', 'b', 'e2e4', 'e4', 1, 0, 'pgn', 1),
        (2, 'r1', 'b', 'c', 'c7c5', 'c5', 1, 0, 'pgn', 1),
        (3, 'r2', 'a', 'b', 'e2e4', 'e4', 1, 1, 'manual', 1);
      INSERT INTO review_log (repertoire_id, fen, uci, grade, is_new, reviewed_at, client_id) VALUES ('r1', 'b', 'c7c5', 'good', 1, 5, 'x1');
      INSERT INTO move_cards (user_id, fen, uci, card, due, reps, lapses, created_at) VALUES ('u1', 'b', 'c7c5', '{}', 9, 1, 0, 5);
    `);
    await migrate(client, '0012_chapters', null);
  });

  it('makes each repertoire a chapter of a repertoire with the same id, name and colour', async () => {
    expect(await rows(client, 'SELECT id, user_id, name, color, created_at FROM repertoires ORDER BY id')).toEqual([
      { id: 'r1', user_id: 'u1', name: 'Sozin', color: 'black', created_at: 10 },
      { id: 'r2', user_id: 'u1', name: 'Scandinave', color: 'white', created_at: 20 },
    ]);
    expect(await rows(client, 'SELECT id, repertoire_id, user_id, name, position, start_fen, active, source_key, created_at FROM chapters ORDER BY id')).toEqual([
      { id: 'r1', repertoire_id: 'r1', user_id: 'u1', name: 'Sozin', position: 0, start_fen: null, active: 1, source_key: 'alphaechecs:sicilienne:Sozin', created_at: 10 },
      { id: 'r2', repertoire_id: 'r2', user_id: 'u1', name: 'Scandinave', position: 0, start_fen: null, active: 0, source_key: null, created_at: 20 },
    ]);
  });

  it('keeps the moves, the history and the cards, now pointing at the chapters', async () => {
    expect(await rows(client, 'SELECT id, chapter_id, uci, paused FROM rep_moves ORDER BY id')).toEqual([
      { id: 1, chapter_id: 'r1', uci: 'e2e4', paused: 0 },
      { id: 2, chapter_id: 'r1', uci: 'c7c5', paused: 0 },
      { id: 3, chapter_id: 'r2', uci: 'e2e4', paused: 1 },
    ]);
    expect(await rows(client, 'SELECT chapter_id, uci FROM review_log')).toEqual([{ chapter_id: 'r1', uci: 'c7c5' }]);
    expect(await rows(client, 'SELECT fen, uci FROM move_cards')).toEqual([{ fen: 'b', uci: 'c7c5' }]);
    expect(await rows(client, 'PRAGMA foreign_key_check')).toEqual([]);
    const targets = async (table: string) => (await rows(client, `PRAGMA foreign_key_list(${table})`)).map((r) => `${r.from}->${r.table}`);
    expect(await targets('rep_moves')).toEqual(['chapter_id->chapters']);
    expect(await targets('review_log')).toEqual(['chapter_id->chapters']);
    expect((await targets('chapters')).sort()).toEqual(['repertoire_id->repertoires', 'user_id->users']);
  });

  it('deletes the chapters and their moves with their repertoire, and keeps the unique moves', async () => {
    await expect(client.execute("INSERT INTO rep_moves (chapter_id, from_fen, to_fen, uci, san, created_at) VALUES ('r1', 'a', 'b', 'e2e4', 'e4', 1)")).rejects.toThrow(/UNIQUE/);
    await client.execute("DELETE FROM repertoires WHERE id = 'r1'");
    expect(await rows(client, 'SELECT id FROM chapters')).toEqual([{ id: 'r2' }]);
    expect(await rows(client, 'SELECT id FROM rep_moves')).toEqual([{ id: 3 }]);
    expect(await rows(client, 'SELECT count(*) AS n FROM review_log')).toEqual([{ n: 0 }]);
  });
});
