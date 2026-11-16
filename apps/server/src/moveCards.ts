/** Move cards: the spaced-repetition state of each move to remember, per user (all repertoires). */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db/client.js';
import { moveCards, repMoves } from './db/schema.js';

/**
 * Makes my moves of a repertoire in a position due for review now (e.g. after a deviation in a
 * game). Only the learnt ones: new moves are learnt through the normal review. Returns how many.
 */
export async function makeDue(userId: string, repertoireId: string, fen: string): Promise<number> {
  const moves = await db
    .select({ uci: repMoves.uci })
    .from(repMoves)
    .where(and(eq(repMoves.repertoireId, repertoireId), eq(repMoves.fromFen, fen)));
  if (!moves.length) return 0;
  const updated = await db
    .update(moveCards)
    .set({ due: new Date() })
    .where(and(eq(moveCards.userId, userId), eq(moveCards.fen, fen), inArray(moveCards.uci, moves.map((m) => m.uci))))
    .returning({ uci: moveCards.uci });
  return updated.length;
}
