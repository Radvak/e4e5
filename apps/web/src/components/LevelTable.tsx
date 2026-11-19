import { playUci, totalGames, type Color, type ExplorerResponse, type PlayedMove } from '@tabiya/core';
import { Fragment, useState } from 'react';
import type { BestMovesResponse } from '../api';
import { moveText } from '../chessText';
import { Icon, plural } from '../ui';
import { isPopular } from './arrows';

const pct = (x: number) => `${Math.round(100 * x)} %`;
const share = (n: number, total: number) => (total ? (100 * n) / total : 0);
/** Games, compact: 950, 12,3 k, 125 k. */
/** Rows shown before "N autres coups". */
const SHOWN = 3;
const games = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: n < 100_000 ? 1 : 0 })} k` : String(n));

export type LevelSort = 'score' | 'freq';

/** Sort of the table (score or frequency), kept on this device. */
export function useLevelSort() {
  const [sort, setSort] = useState<LevelSort>(() => (localStorage.getItem('levelSort') === 'freq' ? 'freq' : 'score'));
  const set = (s: LevelSort) => {
    localStorage.setItem('levelSort', s);
    setSort(s);
  };
  return [sort, set] as const;
}

/**
 * The Lichess moves of the position merged with the search at my level: one row per move with
 * its score, number of games (absolute: how reliable the score is) and win/draw/loss bar. The score is the move's own one
 * (wins + draws / 2, from my side) at depth 0, else the expected score over the likely lines up
 * to the depth chosen with the slider of the footer (my turn only). Sorted by score or by
 * frequency (arrows of the headers); the first rows, "N autres coups" for the others. A row
 * unfolds into the expected line and the opponent's replies.
 */
export function LevelTable({
  data,
  fen,
  color,
  firstMoveNumber,
  inRep,
  onPick,
  onPlay,
  markPopular,
  level,
  depth,
  maxDepth,
  onDepth,
  canSearch,
  levelLoading,
  levelError,
  range,
  engineBest,
  limit = 10,
}: {
  data: ExplorerResponse;
  fen: string;
  /** My colour (scores are from my side). */
  color: Color;
  /** Ply count of the position (for move numbers). */
  firstMoveNumber: number;
  inRep: (uci: string) => boolean;
  onPick: (uci: string) => void;
  onPlay: (moves: PlayedMove[]) => void;
  markPopular: boolean;
  /** Search at my level for the depth chosen (undefined: depth 0 or not computed). */
  level: BestMovesResponse | undefined;
  depth: number;
  maxDepth: number;
  onDepth: (d: number) => void;
  /** The search applies here (my turn). */
  canSearch: boolean;
  levelLoading: boolean;
  levelError: Error | null;
  /** "1600–1999", for the footer. */
  range: string;
  /** Stockfish's best move, to mark when both agree. */
  engineBest?: string;
  /** Only the most played moves, plus the repertoire moves played less often. */
  limit?: number;
}) {
  const [sort, setSort] = useLevelSort();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const total = totalGames(data);
  if (total === 0) return <div className="level-status muted">Aucune partie dans cette position.</div>;

  const searching = canSearch && depth > 0;
  const found = new Map((searching ? level?.moves ?? [] : []).map((m) => [m.uci, m]));
  const reach = searching ? level?.reach ?? null : null;
  const rows = data.moves
    .filter((m, i) => i < limit || inRep(m.uci))
    .map((m) => {
      const n = totalGames(m);
      const mine = color === 'white' ? m.white : m.black;
      const direct = n ? (mine + m.draws / 2) / n : 0;
      const best = found.get(m.uci);
      return { m, n, rank: data.moves.indexOf(m), direct, best, score: best?.score ?? direct };
    });
  if (sort === 'score') rows.sort((a, b) => b.score - a.score || b.n - a.n);
  // Searched up to the depth reached: the best of these is the move the search recommends.
  const top = searching ? rows.find((r) => r.best && r.best.minReach === reach) : undefined;
  const shown = all ? rows : rows.slice(0, SHOWN);

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
  const numbered = (i: number, san: string) => moveText(Array(firstMoveNumber + i).fill(''), san, true);

  // Depth reached, like an engine's: step n of the search, and whether it is still computing.
  const steps = level?.steps ?? [0.5, 0.25, 0.12, 0.06];
  const reached = reach === null ? 0 : steps.indexOf(reach) + 1;
  const computing = searching && !!level && level.pending > 0;
  /** Short state for the footer; `why`: the full explanation (tooltip). */
  let short: string;
  let why: string;
  if (!canSearch) [short, why] = ['tour adverse', 'Au tour de l’adversaire : score des parties pour vous, sans calcul plus loin.'];
  else if (depth === 0) [short, why] = ['coup seul', 'Profondeur 0 : score de chaque coup seul (victoires + nulles / 2, pour vous).'];
  else if (levelLoading) [short, why] = ['calcul…', 'Calcul à votre niveau…'];
  else if (levelError) [short, why] = ['erreur', levelError.message];
  else if (computing) [short, why] = ['calcul…', `Calcul : ${plural(level!.pending, 'position', 'positions')} à récupérer sur Lichess (${range}) pour aller plus loin.`];
  // Nothing explored: the next positions are not stored (and cannot be fetched now).
  else if (reached === 0) [short, why] = ['positions manquantes', 'Positions suivantes pas encore récupérées sur Lichess : score de chaque coup seul, pas de ligne à dérouler.'];
  else if (reached < depth) [short, why] = [`${reached}/${depth} atteinte`, `Profondeur ${reached} atteinte : aller plus loin demanderait trop de positions.`];
  else [short, why] = ['', `Lignes suivies tant qu’elles arrivent dans au moins ${pct(steps[depth - 1]!)} des parties (vos meilleurs coups, les réponses adverses pondérées par leur fréquence).`];

  const header = (key: LevelSort, label: string, title: string, className: string) => (
    <th className={className}>
      <button
        type="button"
        className={`sort ${sort === key ? 'on' : ''}`}
        onClick={() => setSort(key)}
        title={title}
        aria-pressed={sort === key}
      >
        {label} <span aria-hidden="true">{sort === key ? '▼' : '▽'}</span>
      </button>
    </th>
  );

  return (
    <>
      <table className="explorer">
        <thead>
          <tr>
            <th className="san">Coup</th>
            {header('score', 'Score', 'Trier par score (pour vous)', 'score-col')}
            {header('freq', 'Parties', 'Trier par nombre de parties', 'count')}
            <th className="wdl" />
            <th className="unfold-col" />
          </tr>
        </thead>
        <tbody>
          {shown.map(({ m, n, rank, direct, best, score }) => {
            const prepared = inRep(m.uci);
            // Same colours as the arrows: green in the repertoire, orange popular but missing.
            const popular = markPopular && !prepared && isPopular(rank, n / total);
            // Searched less far than the depth reached (or not at all): less precise score.
            const pruned = searching && !!level && (!best || best.minReach !== reach);
            const isOpen = open === m.uci && !!best && best.replies.length > 0;
            const scoreTitle = !searching
              ? `${pct(direct)} pour vous dans les parties Lichess`
              : !best
                ? 'Pas assez joué pour être calculé plus loin : score de ce coup seul.'
                : pruned
                  ? `Écarté plus tôt : calculé moins loin, score moins précis (${pct(direct)} après ce coup seul).`
                  : `Score espéré à votre niveau (${pct(direct)} après ce coup seul).`;
            return (
              <Fragment key={m.uci}>
                <tr
                  className={[prepared ? 'in-rep' : popular ? 'popular' : '', top?.m.uci === m.uci ? 'level-top' : ''].join(' ')}
                  onClick={() => onPick(m.uci)}
                  title={prepared ? 'Dans votre répertoire' : popular ? 'Joué souvent, pas dans votre répertoire' : 'Jouer ce coup'}
                >
                  <td className="san">
                    {prepared ? '✓ ' : ''}
                    {m.san}
                    {engineBest === m.uci && (
                      <span className="sf-tag" title="Aussi le meilleur coup de Stockfish" aria-label="Aussi le meilleur coup de Stockfish">
                        <Icon name="engine" size={12} />
                      </span>
                    )}
                  </td>
                  <td className="score-col">
                    <span className={`score ${searching && !pruned ? 'searched' : ''}`} title={scoreTitle}>
                      {pct(score)}
                    </span>
                  </td>
                  <td className="count" title={`${n.toLocaleString('fr-FR')} parties · ${share(n, total).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % des parties`}>
                    {games(n)}{' '}
                    <span className="share">({share(n, total).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %)</span>
                  </td>
                  <td className="wdl">
                    <div className="bar" title={`Blancs ${share(m.white, n).toFixed(0)} % · nulles ${share(m.draws, n).toFixed(0)} % · Noirs ${share(m.black, n).toFixed(0)} %`}>
                      <span className="w" style={{ width: `${share(m.white, n)}%` }} />
                      <span className="d" style={{ width: `${share(m.draws, n)}%` }} />
                      <span className="b" style={{ width: `${share(m.black, n)}%` }} />
                    </div>
                  </td>
                  <td className="unfold-col" onClick={(e) => e.stopPropagation()}>
                    {best && best.replies.length > 0 && (
                      <button
                        className={`unfold ${isOpen ? 'open' : ''}`}
                        onClick={() => setOpen(isOpen ? null : m.uci)}
                        title={isOpen ? 'Masquer la ligne' : 'Voir la ligne attendue et les réponses adverses'}
                        aria-expanded={isOpen}
                      >
                        <Icon name="chevron" size={16} />
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && best && (
                  <tr className="level-detail">
                    <td colSpan={5}>
                      <div className="pv">
                        {best.line.slice(0, 10).map((s, i, line) => (
                          <button key={i} className="link" onClick={() => onPlay(played(line.slice(0, i + 1).map((x) => x.uci)))} title="Jouer jusqu’à ce coup">
                            {num(i)}
                            {s.san}
                          </button>
                        ))}
                      </div>
                      <ul className="suggestion-replies">
                        {best.replies.map((r) => (
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
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="level-footer muted">
        {rows.length > SHOWN && (
          <button className="link" onClick={() => setAll(!all)}>{all ? 'Moins' : plural(rows.length - SHOWN, 'autre coup', 'autres coups')}</button>
        )}
        <span className="spacer" />
        <label className="level-depth" title={why}>
          {computing && <span className="pulse" aria-hidden="true" />}
          profondeur
          <input
            type="range"
            min={0}
            max={maxDepth}
            step={1}
            value={canSearch ? depth : 0}
            disabled={!canSearch}
            onChange={(e) => onDepth(Number(e.target.value))}
            aria-label="Profondeur du calcul à votre niveau (0 : score de chaque coup seul)"
          />
          {canSearch ? depth : 0}/{maxDepth}
          {short && ` · ${short}`} · Lichess {range}
        </label>
      </div>
    </>
  );
}
