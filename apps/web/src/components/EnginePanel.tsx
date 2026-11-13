import { formatScore, type EngineLine, type PlayedMove } from '@prepa-cahier/core';
import { Icon } from '../ui';

/** On/off button of the engine, next to the board navigation. */
export function EngineToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (on: boolean) => void }) {
  return (
    <button
      className={`engine-toggle ${enabled ? 'on' : ''}`}
      onClick={() => onToggle(!enabled)}
      title={enabled ? 'Éteindre le moteur (e)' : 'Allumer le moteur Stockfish (e)'}
      aria-label={enabled ? 'Éteindre le moteur' : 'Allumer le moteur'}
      aria-pressed={enabled}
    >
      <Icon name="engine" />
    </button>
  );
}

/**
 * Engine lines under the board: evaluation and principal variation; tap a move to play the line
 * up to it. Nothing when the engine is off.
 */
export function EngineLines({
  enabled,
  lines,
  depth,
  maxDepth,
  firstMoveNumber,
  onPlay,
}: {
  enabled: boolean;
  lines: EngineLine[];
  depth: number;
  maxDepth: number;
  /** Ply count of the analysed position (for move numbers). */
  firstMoveNumber: number;
  onPlay: (moves: PlayedMove[]) => void;
}) {
  if (!enabled) return null;
  return (
    <div className="engine-lines">
      {lines.length === 0 && <p className="muted small-text">Stockfish réfléchit…</p>}
      {lines.map((l) => (
        <div key={l.multipv} className={`engine-line ${l.multipv === 1 ? 'best' : ''}`} title={l.multipv === 1 ? 'Meilleure ligne (flèche bleue)' : undefined}>
          <span className={`eval ${('mate' in l.score ? l.score.mate : l.score.cp) >= 0 ? 'w' : 'b'}`}>{formatScore(l.score)}</span>
          <span className="pv">
            {l.pv.slice(0, 10).map((m, i) => {
              const ply = firstMoveNumber + i;
              const num = ply % 2 === 0 ? `${ply / 2 + 1}. ` : i === 0 ? `${(ply + 1) / 2}… ` : '';
              return (
                <button key={i} className="link" onClick={() => onPlay(l.pv.slice(0, i + 1))} title="Jouer jusqu’à ce coup">
                  {num}
                  {m.san}
                </button>
              );
            })}
          </span>
        </div>
      ))}
      {lines.length > 0 && <div className="engine-depth muted">Stockfish 19 · profondeur {depth}/{maxDepth}</div>}
    </div>
  );
}
