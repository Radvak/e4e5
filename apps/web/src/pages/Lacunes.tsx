import { recallOf, type RepMove, type TrainingPosition } from '@e4e5/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type InboxItem, type RepertoireSummary, type ReviewCard } from '../api';
import { GameErrorCard } from '../components/GameErrorCard';
import { MiniBoard, type MiniArrow } from '../components/MiniBoard';
import { San } from '../components/Nag';
import { lineText } from '../training/common';
import { useTrainingSources, type Source } from '../training/useTrainingSources';
import { t } from '../i18n';
import { Button, PageHeader, plural, Tabs } from '../ui';
import { useGamesReport } from './Games';

const PAGE = 20;
const pct = (x: number) => t(`${Math.round(100 * x)} %`, `${Math.round(100 * x)}%`);

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
        title={t('Lacunes', 'Gaps')}
        subtitle={t('Ce qui coince dans vos répertoires, en parties et à l’entraînement', 'Where your repertoires break down, in games and in training')}
        menu={[{ label: t('Réafficher les erreurs de parties ignorées', 'Show the ignored game mistakes again'), onClick: () => restore.mutate() }]}
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
            { id: 'games', label: t(`En parties (${errors.length})`, `In games (${errors.length})`) },
            { id: 'training', label: t(`À l’entraînement (${fragile.length})`, `In training (${fragile.length})`) },
          ]}
        />
        <p className="muted small-text" style={{ margin: 0 }}>
          {filter === 'games'
            ? t(
                'Vous avez joué autre chose que votre coup préparé, du plus fréquent au moins fréquent.',
                'You played something other than your prepared move, most frequent first.',
              )
            : t(
                'Vos coups appris que vous risquez d’oublier (mémorisation estimée sous 90 %) ou déjà oubliés, les plus fragiles d’abord. Les autres coups d’une position pas encore appris n’en font pas partie.',
                'Your learnt moves you may forget (estimated recall under 90%) or already forgot, the most fragile first. The other moves of a position not learnt yet are not included.',
              )}
        </p>
        {notice && (
          <p className="notice success">
            {notice} <Link to="/train">{t('Entraîner', 'Train')}</Link>
          </p>
        )}
        {busy && <p className="muted">{t('Chargement…', 'Loading…')}</p>}
        {!busy && items.length === 0 && (
          <p className="muted">
            {filter === 'games'
              ? t('Aucun écart à votre répertoire dans vos parties.', 'No deviation from your repertoire in your games.')
              : t('Aucune : chaque coup appris a une mémorisation estimée d’au moins 90 %.', 'None: every learnt move has an estimated recall of at least 90%.')}
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
            {t('Voir plus', 'Show more')} ({items.length - shown})
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
  const memo = (w: WeakMove) =>
    t(
      `${pct(w.recall)} de mémorisation${w.lapses > 0 ? ` · oublié ${plural(w.lapses, 'fois', 'fois')}` : ''}`,
      `${pct(w.recall)} recall${w.lapses > 0 ? ` · forgotten ${plural(w.lapses, 'time', 'times')}` : ''}`,
    );
  return (
    <article className="card game-card">
      <Link to={`/r/${source.id}?fen=${fen}`} className="thumb-button" aria-label={t('Voir dans le répertoire', 'See in the repertoire')}>
        <MiniBoard fen={position.fen} orientation={source.color} arrows={arrows} />
      </Link>
      <div className="game-card-body">
        <div className="inbox-head">
          <span className="muted inbox-line">{lineText(position.path) || t('Position initiale', 'Starting position')} </span>
          <span className="hole-move">
            {weak.map((w, i) => (
              <span key={w.move.uci}>
                {i > 0 && t(' et ', ' and ')}
                <San san={w.move.san} nags={w.move.nags} />
              </span>
            ))}
          </span>
        </div>
        <div className="row small-text game-card-meta">
          <span className="rep-tag">
            <span className={`dot ${source.color}`} /> {rep?.name ?? source.name}
          </span>
          <span className="muted">
            {weak.length === 1 ? memo(weak[0]!) : weak.map((w) => t(`${w.move.san} : ${memo(w)}`, `${w.move.san}: ${memo(w)}`)).join(' · ')}
          </span>
        </div>
        <div className="row inbox-actions">
          <Button size="sm" variant="primary" to={`/r/${source.id}/train?from=${fen}`} title={t('S’entraîner sur cette position et la suite de la ligne', 'Train on this position and the rest of the line')}>
            {t('S’entraîner', 'Train')}
          </Button>
          <Button size="sm" to={`/r/${source.id}?fen=${fen}`} title={t('Voir dans l’éditeur du répertoire', 'See in the repertoire editor')}>
            {t('Répertoire', 'Repertoire')}
          </Button>
          <Button size="sm" variant="ghost" icon="compass" to={explorer} title={t('Voir cette position dans l’Explorer (statistiques, moteur, vos répertoires)', 'See this position in Explore (statistics, engine, your repertoires)')}>
            {t('Explorer', 'Explore')}
          </Button>
        </div>
      </div>
    </article>
  );
}
