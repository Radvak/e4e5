import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { START_FEN } from '@tabiya/core';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'pc-stats-')), 'test.db')}`;
const { runMigrations } = await import('../src/db/client.js');
const stats = await import('../src/stats.js');

const answer = (san: string, uci: string) => ({
  white: 60, draws: 10, black: 30,
  moves: [{ uci, san, white: 60, draws: 10, black: 30, game: null }],
  opening: { eco: 'B00', name: 'Test' },
});
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';
const AFTER_E4_E5_NF3_NC6_BC4_NF6 = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -';

beforeAll(async () => {
  await runMigrations();
  const entries = stats.entriesFromQueryCache(
    {
      'variant=standard&speeds=blitz%2Crapid%2Cclassical&ratings=1600%2C1800&play=&moves=30': answer('e4', 'e2e4'),
      'variant=standard&speeds=blitz%2Crapid%2Cclassical&ratings=1600%2C1800&play=e2e4&moves=30': answer('e5', 'e7e5'),
      'variant=standard&speeds=blitz&ratings=2000&play=e2e4&moves=30': answer('c5', 'c7c5'),
      'variant=standard&speeds=blitz%2Crapid%2Cclassical&ratings=1600%2C1800&play=e2e4,e7e5,g1f3,b8c6,f1c4,g8f6&moves=30':
        { ...answer('O-O', 'e1h1') },
      'variant=standard&play=e2e5': answer('x', 'a1a2'),
    },
    Date.parse('2026-11-09'),
  );
  expect(entries).toHaveLength(4); // the illegal line is skipped
  await stats.importEntries(entries, 'import');
});

describe('position stats', () => {
  it('converts move sequences to position keys and normalises castling', async () => {
    const r = await stats.getStats(AFTER_E4_E5_NF3_NC6_BC4_NF6, ['blitz', 'classical', 'rapid'], [1600, 1800]);
    expect(r.data?.moves[0]?.uci).toBe('e1g1');
    expect(r.data?.moves[0]).not.toHaveProperty('game');
  });

  it('serves a fresh exact match as is', async () => {
    const r = await stats.getStats(START_FEN, ['blitz', 'classical', 'rapid'], [1600, 1800]);
    expect(r.data?.moves[0]?.san).toBe('e4');
    if (r.data) expect(r.meta).toMatchObject({ exact: true, source: 'import' });
  });

  it('falls back to the closest combination, preferring rating overlap', async () => {
    const r = await stats.getStats(AFTER_E4, ['blitz'], [1800, 2000]);
    expect(r.data).not.toBeNull();
    if (r.data) {
      expect(r.meta.exact).toBe(false);
      // [1800,2000] overlaps 1600,1800 (1/3) and 2000 (1/2): the 2000 blitz entry wins.
      expect(r.data.moves[0]?.san).toBe('c5');
    }
  });

  it('uses the rows of another period when the period in use has none (not exact)', async () => {
    const { db } = await import('../src/db/client.js');
    const { positionStats } = await import('../src/db/schema.js');
    const fen = AFTER_E4_E5_NF3_NC6_BC4_NF6.replace(' w ', ' b ').replace('KQkq', 'Qkq');
    await db.insert(positionStats).values({
      fen, speeds: 'blitz,rapid', ratings: '1600,1800', data: answer('d5', 'd7d5'),
      fetchedAt: new Date(), source: 'lichess', period: '2026-10..2026-10',
    });
    // Without a game database file the period in use is the whole history (''): none stored.
    const r = await stats.getStats(fen, ['blitz', 'rapid'], [1600, 1800]);
    expect(r.data?.moves[0]?.san).toBe('d5');
    if (r.data) expect(r.meta.exact).toBe(false);
    expect((await stats.storedStats([fen], ['blitz', 'rapid'], [1600, 1800])).get(fen)?.exact).toBe(false);
  });

  it('reports unknown positions', async () => {
    const r = await stats.getStats(AFTER_E4_E5_NF3_NC6_BC4_NF6.replace(' w ', ' b '), ['blitz'], [1600]);
    expect(r).toEqual({ data: null, reason: 'not-stored' });
  });

  it('does not overwrite newer data with an older import', async () => {
    const older = [{ fen: START_FEN, speeds: ['blitz', 'classical', 'rapid'], ratings: [1600, 1800], fetchedAt: 0, data: answer('d4', 'd2d4') }];
    expect(await stats.importEntries(older, 'import')).toBe(0);
  });
});
