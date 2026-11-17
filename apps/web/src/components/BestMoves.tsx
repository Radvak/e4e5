import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { moveText } from '../chessText';
import { plural } from '../ui';

const pct = (x: number) => `${Math.round(100 * x)} %`;
const games = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: n < 10_000 ? 1 : 0 })} k` : String(n));

/**
 * "Coups suggérés", at the end of a line on my turn: my moves with the best expected score at
 * my level, if I go on with the suggested moves (a few moves ahead, not only the next move's
 * win rate). The deeper positions are fetched in the background, so it asks again meanwhile.
 * Tapping one plays the move.
 */
export function BestMoves({ fen, history, speeds, ratings, onPlay }: { fen: string; history: string[]; speeds: string[]; ratings: number[]; onPlay: (uci: string) => void }) {
  const q = useQuery({
    queryKey: ['best-moves', fen, speeds, ratings],
    queryFn: () => api.bestMoves(fen, speeds, ratings),
    staleTime: 10 * 60_000,
    retry: false,
    refetchInterval: (query) => (query.state.data?.pending ? 4000 : false),
  });
  const moves = q.data?.moves ?? [];
  const reach = q.data?.reach ?? null;
  if (q.isLoading) return null;
  if (!moves.length) return null;
  return (
    <section className="panel suggestions">
      <h3>Coups suggérés</h3>
      <p className="muted small-text">
        Score espéré à votre niveau si vous jouez la suite proposée, face aux réponses adverses.{' '}
        {reach === null ? 'Pour l’instant, score du coup seul' : `Lignes suivies tant qu’elles arrivent dans au moins ${pct(reach)} des parties`}
        {reach !== q.data!.target && q.data!.pending > 0 && ` (calcul en cours : ${plural(q.data!.pending, 'position', 'positions')} à récupérer…)`}.
      </p>
      <ul className="suggestion-list">
        {moves.map((m) => {
          // Not looked at deeper (behind at the step before): its score is from that step.
          const pruned = m.minReach !== reach;
          const after = [...history, m.san];
          return (
            <li key={m.uci}>
              <button className={`suggestion ${pruned ? 'pruned' : ''}`} onClick={() => onPlay(m.uci)}>
                <span className="line">
                  <span className="best-move">{moveText(history, m.san, true)}</span>
                  {pruned && <span className="muted small-text"> ({m.minReach === null ? 'coup seul' : `lignes à ${pct(m.minReach)} et plus`})</span>}
                </span>
                <span className="freq" title={`Lichess : ${pct(m.direct)} après ce coup seul, sur ${m.games} parties`}>
                  <strong>{pct(m.score)}</strong>
                  <span className="muted small-text"> · {games(m.games)}</span>
                </span>
              </button>
              {m.replies.length > 0 && (
                <ul className="suggestion-replies">
                  {m.replies.map((r) => (
                    <li key={r.uci}>
                      <span className="reply">
                        {moveText(after, r.san)}
                        <span className="muted small-text"> {pct(r.share)}</span>
                        {r.answer && <span className="answer"> {moveText([...after, r.san], r.answer.san, true)}</span>}
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
      <p className="muted small-text">Score espéré · parties. Sous chaque coup : les réponses adverses (part des parties), votre meilleure suite et le score espéré après.</p>
    </section>
  );
}
