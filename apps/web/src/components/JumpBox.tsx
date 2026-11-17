import {
  fenKey,
  pathTo,
  playSanOn,
  playUciOn,
  positionFromFen,
  START_FEN,
  type PlayedMove,
  type Repertoire,
} from '@tabiya/core';
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
 * Search box: a move sequence (jumps there, saved or not); with a repertoire, also a FEN (jumps
 * if the position is in it) or text searched in its comments.
 */
export const JumpBox = forwardRef<HTMLInputElement, { rep?: Repertoire; onJump: (line: PlayedMove[]) => void }>(
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
        if (!rep) return setError('Saisissez des coups, par exemple 1. e4 c5 2. Nf3.');
        let key: string;
        try {
          key = fenKey(positionFromFen(q));
        } catch {
          return setError('FEN invalide.');
        }
        const path = pathTo(rep, key);
        return path ? jump(path) : setError('Cette position n’est pas dans le répertoire.');
      }
      const moves = parseMoves(q);
      if (moves) return jump(moves);
      if (!rep) return setError('Coups illégaux ou mal écrits (exemple : 1. e4 c5 2. Nf3).');
      const needle = q.toLowerCase();
      const found: Hit[] = [];
      for (const m of rep.all()) {
        if (!m.comment?.toLowerCase().includes(needle)) continue;
        const path = pathTo(rep, m.fromFen);
        if (path) found.push({ line: [...path, m], comment: m.comment });
        if (found.length >= 20) break;
      }
      if (!found.length) return setError('Aucun coup légal, FEN ou commentaire correspondant.');
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
            placeholder={rep ? 'Aller à : coups (1. e4 c5 2. Nf3), FEN ou mot d’un commentaire' : 'Aller à : 1. e4 c5 2. Nf3'}
            aria-label="Chercher ou aller à une position"
          />
          <button type="submit">OK</button>
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
