import { formatScore, type EngineLine, type PlayedMove } from '@prepa-cahier/core';

/** Engine lines: evaluation and principal variation; click a move to play the line up to it. */
export function EnginePanel({
  enabled,
  onToggle,
  lines,
  depth,
  maxDepth,
  firstMoveNumber,
  onPlay,
  hint = 'Touchez un coup pour jouer la ligne jusqu’à lui.',
}: {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  lines: EngineLine[];
  depth: number;
  maxDepth: number;
  /** Ply count of the analysed position (for move numbers). */
  firstMoveNumber: number;
  onPlay: (moves: PlayedMove[]) => void;
  /** Help text under the lines. */
  hint?: string;
}) {
  return (
    <section className="panel engine">
      <div className="row">
        <h3>Moteur</h3>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} /> Stockfish 19
        </label>
        {enabled && (
          <span className="muted small-text">
            profondeur {depth}/{maxDepth}
          </span>
        )}
      </div>
      {enabled && lines.length === 0 && <p className="muted small-text">Réflexion…</p>}
      {enabled &&
        lines.map((l) => (
          <div key={l.multipv} className="engine-line">
            <span className={`eval ${('mate' in l.score ? l.score.mate : l.score.cp) >= 0 ? 'w' : 'b'}`}>
              {formatScore(l.score)}
            </span>
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
      {enabled && <p className="muted small-text">{hint}</p>}
    </section>
  );
}
