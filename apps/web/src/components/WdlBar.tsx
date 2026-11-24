import type { Color } from '@e4e5/core';
import { t } from '../i18n';

const pct = (n: number, total: number) => (total ? (100 * n) / total : 0);

/**
 * Results of the games of a move, from my side: my wins (in my colour) on the left, then draws,
 * then losses, so that "left part + half the draws" reads as my score in these games.
 * `expected`: the score expected at my level once the likely lines are followed (search), shown
 * as a mark on the bar where it lands (it may differ from the move's own results).
 */
export function WdlBar({ white, draws, black, color, expected }: { white: number; draws: number; black: number; color: Color; expected?: number }) {
  const n = white + draws + black;
  const [mine, theirs] = color === 'white' ? [white, black] : [black, white];
  const [mineClass, theirsClass] = color === 'white' ? ['w', 'b'] : ['b', 'w'];
  const own = pct(mine + draws / 2, n);
  const title = t(
    `Vos victoires ${pct(mine, n).toFixed(0)} % · nulles ${pct(draws, n).toFixed(0)} % · défaites ${pct(theirs, n).toFixed(0)} %` +
      ` (score ${own.toFixed(0)} %)` +
      (expected !== undefined ? ` · repère violet : score espéré à votre niveau, ${Math.round(100 * expected)} %` : ''),
    `Your wins ${pct(mine, n).toFixed(0)}% · draws ${pct(draws, n).toFixed(0)}% · losses ${pct(theirs, n).toFixed(0)}%` +
      ` (score ${own.toFixed(0)}%)` +
      (expected !== undefined ? ` · purple mark: expected score at your level, ${Math.round(100 * expected)}%` : ''),
  );
  return (
    <div className="bar" title={title}>
      <span className={mineClass} style={{ width: `${pct(mine, n)}%` }} />
      <span className="d" style={{ width: `${pct(draws, n)}%` }} />
      <span className={theirsClass} style={{ width: `${pct(theirs, n)}%` }} />
      {expected !== undefined && <span className="bar-mark" style={{ left: `${100 * expected}%` }} />}
    </div>
  );
}
