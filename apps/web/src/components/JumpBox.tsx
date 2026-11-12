import {
  fenKey,
  pathTo,
  playSanOn,
  playUciOn,
  positionFromFen,
  START_FEN,
  type PlayedMove,
  type Repertoire,
} from '@prepa-cahier/core';
import { forwardRef, useState } from 'react';

interface Hit {
  line: PlayedMove[];
  comment: string;
}

const RESULTS = new Set(['*', '1-0', '0-1', '1/2-1/2']);

/** Moves typed as SAN ("1. e4 c5 2. Nf3") or UCI ("e2e4 c7c5"), played from the start. */
function parseMoves(text: string): PlayedMove[] | null {
  const tokens = text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !RESULTS.has(t));
  if (!tokens.length) return null;
  const pos = positionFromFen(START_FEN);
  const line: PlayedMove[] = [];
  for (const t of tokens) {
    const played = playSanOn(pos, t) ?? playUciOn(pos, t);
    if (!played) return null;
    line.push(played);
  }
  return line;
}

const lineText = (line: PlayedMove[]) =>
  line.map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m.san}`).join(' ');

/**
 * Search box: a move sequence (jumps there, saved or not), a FEN (jumps if the position is in
 * the repertoire), or text searched in the comments.
 */
export const JumpBox = forwardRef<HTMLInputElement, { rep: Repertoire; onJump: (line: PlayedMove[]) => void }>(
  function JumpBox({ rep, onJump }, ref) {
    const [text, setText] = useState('');
    const [hits, setHits] = useState<Hit[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const jump = (line: PlayedMove[]) => {
      onJump(line);
      setHits(null);
      setError(null);
      setText('');
    };

    const search = () => {
      const q = text.trim();
      setHits(null);
      setError(null);
      if (!q) return;
      if (q.split('/').length === 8) {
        let key: string;
        try {
          key = fenKey(positionFromFen(q));
        } catch {
          return setError('Invalid FEN.');
        }
        const path = pathTo(rep, key);
        return path ? jump(path) : setError('This position is not in the repertoire.');
      }
      const moves = parseMoves(q);
      if (moves) return jump(moves);
      const needle = q.toLowerCase();
      const found: Hit[] = [];
      for (const m of rep.all()) {
        if (!m.comment?.toLowerCase().includes(needle)) continue;
        const path = pathTo(rep, m.fromFen);
        if (path) found.push({ line: [...path, m], comment: m.comment });
        if (found.length >= 20) break;
      }
      if (!found.length) return setError('No legal moves, FEN or comment matching.');
      setHits(found.sort((a, b) => a.line.length - b.line.length));
    };

    return (
      <div className="jump">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), setHits(null), setError(null))}
            placeholder="Jump: moves (1. e4 c5 2. Nf3), FEN, or a word from your comments   ( / )"
            aria-label="Search or jump to a position"
          />
          <button type="submit">Go</button>
        </form>
        {error && <p className="error small-text">{error}</p>}
        {hits && (
          <ul className="hits">
            {hits.map((h, i) => (
              <li key={i}>
                <button className="link" onClick={() => jump(h.line)}>{lineText(h.line)}</button>
                <span className="comment"> {h.comment}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
