import { recallOf, type RepMove, type TrainingPosition } from '@tabiya/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type InboxItem, type RepertoireSummary, type ReviewCard } from '../api';
import { GameErrorCard } from '../components/GameErrorCard';
import { MiniBoard, type MiniArrow } from '../components/MiniBoard';
import { lineText } from '../training/common';
import { useTrainingSources, type Source } from '../training/useTrainingSources';
import { Button, PageHeader, plural, Tabs } from '../ui';
import { useGamesReport } from './Games';

const PAGE = 20;
const pct = (x: number) => `${Math.round(100 * x)} %`;

type Filter = 'games' | 'training';

/** One of my learnt moves I struggle with: estimated recall under 90 %, or forgotten at least once. */
interface WeakMove {
  move: RepMove;
  recall: number;
  lapses: number;
}

/**
 * A position of my training with weak moves. Only the learnt moves count: another move of the
 * position not learnt yet (an alternative) is to learn, not a gap, and playing an alternative in
 * training is never a mistake.
 */
interface Fragile {
  source: Source;
  position: TrainingPosition;
  weak: WeakMove[];
  /** The weakest of them. */
  recall: number;
  lapses: number;
}

/** The weak learnt moves of a position (recall computed now from the FSRS card). */
function weakMoves(source: Source, fen: string, now: Date): WeakMove[] {
  return source.rep.movesAt(fen).flatMap((move) => {
    const card: ReviewCard | undefined = source.cardOf(fen, move.uci);
    if (!card) return [];
    const recall = card.fsrs ? recallOf(card.fsrs, card.reps, now) : card.recall;
    return recall < 0.9 || card.lapses > 0 ? [{ move, recall, lapses: card.lapses }] : [];
  });
}

type Difficult = { kind: 'game'; item: InboxItem } | { kind: 'training'; fragile: Fragile };

/**
 * Lacunes: the gaps in what I know of my repertoires, in my games (moves played instead of the
 * prepared ones) and in my training (fragile or forgotten positions).
 */
export function Lacunes() {
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const ids = useMemo(() => (reps.data ?? []).map((r) => r.id), [reps.data]);
  const byId = useMemo(() => new Map((reps.data ?? []).map((r) => [r.id, r])), [reps.data]);
  const { sources, loading } = useTrainingSources(ids, null);
  const report = useGamesReport();
  const qc = useQueryClient();
  const restore = useMutation({ mutationFn: api.restoreInbox, onSuccess: () => qc.invalidateQueries({ queryKey: ['games-report'] }) });
  /** Chosen tab (null: the games, unless they have nothing to show and the training has). */
  const [chosen, setFilter] = useState<Filter | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [notice, setNotice] = useState<string | null>(null);

  const fragile = useMemo<Fragile[]>(() => {
    const now = new Date();
    // Cards belong to the user: a position in several repertoires is listed once.
    const seen = new Set<string>();
    const out: Fragile[] = [];
    for (const source of sources) {
      for (const position of source.positions) {
        if (seen.has(position.fen)) continue;
        const weak = weakMoves(source, position.fen, now);
        if (!weak.length) continue;
        seen.add(position.fen);
        out.push({ source, position, weak, recall: Math.min(...weak.map((w) => w.recall)), lapses: Math.max(...weak.map((w) => w.lapses)) });
      }
    }
    // The weakest first: lowest recall, then the most forgotten.
    return out.sort((a, b) => a.recall - b.recall || b.lapses - a.lapses);
  }, [sources]);
  const errors = report.data?.inbox.errors ?? [];
  const filter: Filter = chosen ?? (report.data && errors.length === 0 && fragile.length > 0 ? 'training' : 'games');

  const items: Difficult[] =
    filter === 'games' ? errors.map((item) => ({ kind: 'game' as const, item })) : fragile.map((f) => ({ kind: 'training' as const, fragile: f }));
  const busy = filter === 'games' ? report.isLoading : loading;

  return (
    <div className="games-page stack">
      <PageHeader
        title="Lacunes"
        subtitle="Ce qui coince dans vos répertoires, en parties et à l’entraînement"
        menu={[{ label: 'Réafficher les erreurs de parties ignorées', onClick: () => restore.mutate() }]}
      />

      <section className="stack">
        <Tabs<Filter>
          block
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setShown(PAGE);
          }}
          tabs={[
            { id: 'games', label: `En parties (${errors.length})` },
            { id: 'training', label: `À l’entraînement (${fragile.length})` },
          ]}
        />
        <p className="muted small-text" style={{ margin: 0 }}>
          {filter === 'games'
            ? 'Vous avez joué autre chose que votre coup préparé, du plus fréquent au moins fréquent.'
            : 'Vos coups appris que vous risquez d’oublier (mémorisation estimée sous 90 %) ou déjà oubliés, les plus fragiles d’abord. Les autres coups d’une position pas encore appris n’en font pas partie.'}
        </p>
        {notice && (
          <p className="notice success">
            {notice} <Link to="/train">Entraîner</Link>
          </p>
        )}
        {busy && <p className="muted">Chargement…</p>}
        {!busy && items.length === 0 && (
          <p className="muted">
            {filter === 'games'
              ? 'Aucun écart à votre répertoire dans vos parties.'
              : 'Aucune : chaque coup appris a une mémorisation estimée d’au moins 90 %.'}
          </p>
        )}
        {items.slice(0, shown).map((d) =>
          d.kind === 'game' ? (
            <GameErrorCard key={`g|${d.item.key}`} item={d.item} rep={byId.get(d.item.repertoireId)} onDone={setNotice} />
          ) : (
            <FragileCard key={`t|${d.fragile.source.id}|${d.fragile.position.fen}`} fragile={d.fragile} rep={byId.get(d.fragile.source.id)} />
          ),
        )}
        {items.length > shown && (
          <Button variant="ghost" onClick={() => setShown(shown + PAGE)}>
            Voir plus ({items.length - shown})
          </Button>
        )}
      </section>

    </div>
  );
}

/** A fragile position of my training: thumbnail with its weak moves, recall, and where to work on it. */
function FragileCard({ fragile, rep }: { fragile: Fragile; rep: RepertoireSummary | undefined }) {
  const { source, position, weak } = fragile;
  const arrows: MiniArrow[] = weak.map((w) => ({ uci: w.move.uci, kind: 'repertoire' }));
  const fen = encodeURIComponent(position.fen);
  const explorer = `/explorer?${new URLSearchParams({ ...(position.path.length ? { line: position.path.map((m) => m.uci).join(',') } : {}), ...(source.color === 'black' ? { color: 'black' } : {}) })}`;
  const memo = (w: WeakMove) => `${pct(w.recall)} de mémorisation${w.lapses > 0 ? ` · oublié ${plural(w.lapses, 'fois', 'fois')}` : ''}`;
  return (
    <article className="card game-card">
      <Link to={`/r/${source.id}?fen=${fen}`} className="thumb-button" aria-label="Voir dans le répertoire">
        <MiniBoard fen={position.fen} orientation={source.color} arrows={arrows} />
      </Link>
      <div className="game-card-body">
        <div className="inbox-head">
          <span className="muted inbox-line">{lineText(position.path) || 'Position initiale'} </span>
          <span className="hole-move">{weak.map((w) => w.move.san).join(' et ')}</span>
        </div>
        <div className="row small-text game-card-meta">
          <span className="rep-tag">
            <span className={`dot ${source.color}`} /> {rep?.name ?? source.name}
          </span>
          <span className="muted">
            {weak.length === 1 ? memo(weak[0]!) : weak.map((w) => `${w.move.san} : ${memo(w)}`).join(' · ')}
          </span>
        </div>
        <div className="row inbox-actions">
          <Button size="sm" variant="primary" to={`/r/${source.id}/train?from=${fen}`} title="S’entraîner sur cette position et la suite de la ligne">
            S’entraîner
          </Button>
          <Button size="sm" to={`/r/${source.id}?fen=${fen}`} title="Voir dans l’éditeur du répertoire">
            Répertoire
          </Button>
          <Button size="sm" variant="ghost" icon="compass" to={explorer} title="Voir cette position dans l’Explorer (statistiques, moteur, vos répertoires)">
            Explorer
          </Button>
        </div>
      </div>
    </article>
  );
}
