import { playUci, type PlayedMove } from '@prepa-cahier/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type BestMovesResponse } from '../api';
import { moveText } from '../chessText';
import { Icon, plural } from '../ui';

const pct = (x: number) => `${Math.round(100 * x)} %`;
const games = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: n < 10_000 ? 1 : 0 })} k` : String(n));
/** Rows shown before "plus". */
const SHOWN = 3;

/**
 * On/off of the "moves at my level" search, kept for the browser session only: it costs many
 * Lichess requests, so it never starts by itself on a new visit.
 */
export function useLevelToggle() {
  const [on, setOn] = useState(() => sessionStorage.getItem('level') === 'on');
  const toggle = (next: boolean) => {
    sessionStorage.setItem('level', next ? 'on' : 'off');
    setOn(next);
  };
  return [on, toggle] as const;
}

/**
 * Suggested moves for the side to move: best expected score at my level over the likely lines.
 * The deeper positions are fetched in the background by the server, so it asks again meanwhile.
 * Only asked while `enabled`.
 */
export function useBestMoves(fen: string, speeds: string[], ratings: number[], enabled: boolean) {
  return useQuery({
    queryKey: ['best-moves', fen, speeds, ratings],
    queryFn: () => api.bestMoves(fen, speeds, ratings),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
    refetchInterval: (query) => (query.state.data?.pending ? 4000 : false),
  });
}

/** The move to draw on the board: the best one looked at the furthest. */
export function topLevelMove(data: BestMovesResponse | undefined) {
  return data?.moves.find((m) => m.minReach === data.reach) ?? data?.moves[0];
}

/** On/off button, next to the engine's. */
export function LevelToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (on: boolean) => void }) {
  return (
    <button
      className={`level-toggle ${enabled ? 'on' : ''}`}
      onClick={() => onToggle(!enabled)}
      title={enabled ? 'Arrêter les coups à votre niveau (n)' : 'Coups à votre niveau : meilleur score espéré face aux joueurs Lichess de votre niveau (n)'}
      aria-label={enabled ? 'Arrêter les coups à votre niveau' : 'Coups à votre niveau'}
      aria-pressed={enabled}
    >
      <Icon name="level" />
    </button>
  );
}

/**
 * Moves at my level, under the board like the engine lines: expected score, then the expected
 * line (tap a move to play the line up to it). A row unfolds into the opponent's replies.
 */
export function LevelLines({
  enabled,
  fen,
  firstMoveNumber,
  speeds,
  ratings,
  range,
  blocked,
  engineBest,
  onPlay,
}: {
  enabled: boolean;
  fen: string;
  /** Ply count of the position (for move numbers). */
  firstMoveNumber: number;
  speeds: string[];
  ratings: number[];
  /** "1600–1999", for the footer. */
  range: string;
  /** Why it is not computed here (e.g. the opponent's turn): shown instead. */
  blocked?: string;
  /** Stockfish's best move, to mark when both agree. */
  engineBest?: string;
  onPlay: (moves: PlayedMove[]) => void;
}) {
  const q = useBestMoves(fen, speeds, ratings, enabled && !blocked);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (!enabled) return null;

  const data = q.data;
  const reach = data?.reach ?? null;
  const moves = data?.moves ?? [];
  const shown = all ? moves : moves.slice(0, SHOWN);
  /** The moves of `ucis` played from the position (stops at an illegal one). */
  const played = (ucis: string[]) => {
    const out: PlayedMove[] = [];
    for (const uci of ucis) {
      const m = playUci(out.at(-1)?.toFen ?? fen, uci);
      if (!m) break;
      out.push(m);
    }
    return out;
  };
  const num = (i: number) => {
    const ply = firstMoveNumber + i;
    return ply % 2 === 0 ? `${ply / 2 + 1}. ` : i === 0 ? `${(ply + 1) / 2}… ` : '';
  };

  /** The move `i` plies after the position, numbered ("7. f4", "6… e6" for Black). */
  const numbered = (i: number, san: string) => moveText(Array(firstMoveNumber + i).fill(''), san, true);

  // Depth, like an engine's: step n of the search (lines followed while reached in at least
  // steps[n-1] of the games), and how far ahead the best lines go.
  const steps = data?.steps ?? [0.5, 0.25, 0.12, 0.06];
  const step = reach === null ? 0 : steps.indexOf(reach) + 1;
  const computing = !!data && data.pending > 0;
  const plies = Math.max(0, ...moves.filter((m) => m.minReach === reach).map((m) => m.line.length));
  const depthWhy = [
    reach === null
      ? 'Profondeur 0 : score de chaque coup seul, en attendant les positions suivantes.'
      : `Profondeur ${step} : les lignes sont suivies tant qu’elles arrivent dans au moins ${pct(reach)} des parties (vos meilleurs coups, les réponses adverses pondérées par leur fréquence), jusqu’à ${plies} demi-coups plus loin.`,
    computing ? `Calcul en cours : ${plural(data!.pending, 'position', 'positions')} à récupérer sur Lichess (${range}) pour aller plus loin.` : step < steps.length ? 'Calcul terminé : aller plus loin demanderait trop de positions.' : 'Calcul terminé.',
  ].join(' ');

  let status: string;
  if (blocked) status = blocked;
  else if (q.isLoading) status = 'Calcul à votre niveau…';
  else if (q.error) status = q.error.message;
  else if (!moves.length) status = 'Pas assez de parties à ce niveau dans cette position.';
  else status = '';

  return (
    <div className="level-lines">
      {status ? (
        <div className="level-status muted">{status}</div>
      ) : (
        <ul>
          {shown.map((m) => {
            // Not looked at as far as the others (behind at an earlier step): its score is less precise.
            const pruned = m.minReach !== reach;
            const prunedWhy =
              m.minReach === null
                ? 'Score de ce coup seul sur Lichess : il n’a pas été calculé plus loin.'
                : `Écarté quand les lignes étaient suivies jusqu’à ${pct(m.minReach)} des parties : calculé moins loin, score moins précis.`;
            const isOpen = open === m.uci && m.replies.length > 0;
            return (
              <li key={m.uci} className={pruned ? 'pruned' : ''}>
                <div className="level-line">
                  <span className="score" title={pruned ? prunedWhy : `Score espéré à votre niveau (Lichess : ${pct(m.direct)} après ce coup seul)`}>
                    {pct(m.score)}
                  </span>
                  <span className="pv">
                    {(m.line.length ? m.line : [m]).slice(0, 8).map((s, i, line) => (
                      <button key={i} className="link" onClick={() => onPlay(played(line.slice(0, i + 1).map((x) => x.uci)))} title="Jouer jusqu’à ce coup">
                        {num(i)}
                        {s.san}
                      </button>
                    ))}
                  </span>
                  {engineBest === m.uci && <span className="sf-tag" title="Aussi le meilleur coup de Stockfish" aria-label="Aussi le meilleur coup de Stockfish"><Icon name="engine" size={14} /></span>}
                  <span className="games muted" title={`${m.games.toLocaleString('fr-FR')} parties avec ce coup`}>{games(m.games)}</span>
                  {m.replies.length > 0 && (
                    <button
                      className={`unfold ${isOpen ? 'open' : ''}`}
                      onClick={() => setOpen(isOpen ? null : m.uci)}
                      title={isOpen ? 'Masquer les réponses adverses' : 'Voir les réponses adverses et vos suites'}
                      aria-expanded={isOpen}
                    >
                      <Icon name="chevron" size={16} />
                    </button>
                  )}
                </div>
                {isOpen && (
                  <ul className="suggestion-replies">
                    {m.replies.map((r) => (
                      <li key={r.uci}>
                        <span className="reply">
                          <button className="link" onClick={() => onPlay(played([m.uci, r.uci]))}>{numbered(1, r.san)}</button>
                          <span className="muted small-text"> {pct(r.share)} </span>
                          {r.answer && (
                            <button className="link answer" onClick={() => onPlay(played([m.uci, r.uci, r.answer!.uci]))}>
                              {numbered(2, r.answer.san)}
                            </button>
                          )}
                        </span>
                        <span className="reply-score">{pct(r.score)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="level-footer muted">
        {moves.length > SHOWN && !blocked && (
          <button className="link" onClick={() => setAll(!all)}>{all ? 'Moins' : plural(moves.length - SHOWN, 'autre coup', 'autres coups')}</button>
        )}
        <span className="spacer" />
        {!blocked && data && (
          <span className="level-depth" title={depthWhy}>
            {computing && <span className="pulse" aria-hidden="true" />}
            <span className="gauge" aria-hidden="true">
              {steps.map((_, i) => <span key={i} className={i < step ? 'done' : i === step && computing ? 'doing' : ''} />)}
            </span>
            profondeur {step}/{steps.length}
            {plies > 1 && ` · ${plies} demi-coups`}
            {computing ? ' · calcul…' : ` · Lichess ${range}`}
          </span>
        )}
        {blocked && <span>Lichess {range}</span>}
      </div>
    </div>
  );
}
