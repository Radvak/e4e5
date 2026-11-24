import type { EngineLine } from '@e4e5/core';
import { useEffect, useState } from 'react';
import { getEngine } from './stockfish';

const DEPTH = 22;

/** Live analysis of `fen` while `enabled`: best lines (by multipv) and current depth. */
export function useEngine(fen: string, enabled: boolean, multipv = 3) {
  const [lines, setLines] = useState<EngineLine[]>([]);

  useEffect(() => {
    setLines([]);
    if (!enabled) {
      void getEngine().stop();
      return;
    }
    let alive = true;
    void getEngine().analyse({
      fen,
      multipv,
      depth: DEPTH,
      onLine: (line) => {
        if (!alive) return;
        setLines((old) => {
          const next = [...old];
          next[line.multipv - 1] = line; // one slot per line
          return next;
        });
      },
    });
    return () => {
      alive = false;
    };
  }, [fen, enabled, multipv]);

  // Lines from a shallower depth than the best one are outdated.
  const best = lines[0]?.depth ?? 0;
  const shown = lines.filter((l): l is EngineLine => !!l && l.depth >= best - 1);
  return { lines: shown, depth: best, maxDepth: DEPTH };
}
