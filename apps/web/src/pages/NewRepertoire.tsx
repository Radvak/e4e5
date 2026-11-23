import { lichessStudyRef, pgnToMoves, trunkOf, type Color, type Thumbnail } from '@tabiya/core';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type LichessStudy, type LichessStudySummary, type RepertoireSummary } from '../api';
import { lineText } from '../chessText';
import { MiniBoard } from '../components/MiniBoard';
import { Button, Icon, PageHeader, Tabs, plural } from '../ui';

/** The value after `ms` without change (the search waits for the typing to stop). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const likes = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : String(n));
const arrowsOf = (t: Thumbnail) => t.branches.map((uci) => ({ uci, kind: 'repertoire' as const }));
const COLOR_TABS = [
  { id: 'white' as const, label: <><span className="dot white" /> Blancs</> },
  { id: 'black' as const, label: <><span className="dot black" /> Noirs</> },
];

/**
 * New repertoire, from one search field and one side: what is typed filters the public Lichess
 * studies of that side (cards: thumbnail, size; most liked first) and is also the name of an
 * empty repertoire to create (Entrée, or the "Créer" row). A pasted study link opens it. A study opens its chapters
 * to choose from (?etude=, ?chapitre= for a chapter link).
 */
export function NewRepertoire() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const studyId = params.get('etude');
  const chapterId = params.get('chapitre') ?? undefined;

  const created = async (rep: RepertoireSummary) => {
    await qc.invalidateQueries({ queryKey: ['repertoires'] });
    navigate(`/r/${rep.id}`);
  };
  const openStudy = (ref: { studyId: string; chapterId?: string }) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('etude', ref.studyId);
      if (ref.chapterId) next.set('chapitre', ref.chapterId);
      else next.delete('chapitre');
      // A pasted link is not a search to come back to.
      if (lichessStudyRef(next.get('q') ?? '')) next.delete('q');
      return next;
    });
  const closeStudy = () =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('etude');
      next.delete('chapitre');
      return next;
    });

  return (
    <div className="new-rep-page">
      <PageHeader title="Nouveau répertoire" back={studyId ? undefined : '/repertoires'} />
      {studyId ? (
        <StudyImport key={studyId} studyId={studyId} chapterId={chapterId} onBack={closeStudy} onCreated={created} />
      ) : (
        <Catalogue onOpen={openStudy} onCreated={created} />
      )}
    </div>
  );
}

/**
 * The search field with the side (one choice for both: the empty repertoire's side, and the
 * studies shown), the empty repertoire named after what is typed ("Créer « … »", once typing),
 * and the public Lichess studies matching it, of that side, as cards.
 */
function Catalogue({ onOpen, onCreated }: { onOpen: (ref: { studyId: string; chapterId?: string }) => void; onCreated: (rep: RepertoireSummary) => void }) {
  const [params, setParams] = useSearchParams();
  // Typed into local state (the URL lags behind fast typing), copied to the URL (?q=) to come back to.
  const [input, setInput] = useState(() => params.get('q') ?? '');
  const color: Color = params.get('couleur') === 'black' ? 'black' : 'white';
  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const ref = lichessStudyRef(input);
  const name = ref ? '' : input.trim().slice(0, 100);
  const q = useDebounced(name, 400);
  useEffect(() => {
    if (ref) onOpen(ref);
  }, [ref?.studyId, ref?.chapterId]);
  useEffect(() => {
    if (!ref) set('q', q);
  }, [q]);

  const create = useMutation({ mutationFn: () => api.createRepertoire(name, color), onSuccess: onCreated });
  const side = color === 'white' ? 'Blancs' : 'Noirs';
  const list = useInfiniteQuery({
    queryKey: ['lichess-studies', q],
    queryFn: ({ pageParam }) => api.lichessStudies(q, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.nbPages ? last.page + 1 : undefined),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const studies = list.data?.pages.flatMap((p) => p.studies) ?? [];
  const total = list.data?.pages[0]?.nbResults ?? 0;

  return (
    <section className="catalogue">
      {/* Enter creates the empty repertoire named after what is typed. */}
      <form
        className="new-rep-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (name && !create.isPending) create.mutate();
        }}
      >
        <label className="rep-search new-rep-search">
          <Icon name="search" size={20} />
          <input
            autoFocus
            type="search"
            placeholder="Nom du répertoire ou ouverture à chercher (Caro-Kann, Londres…)"
            aria-label="Nom du répertoire ou étude Lichess à chercher"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <Tabs value={color} onChange={(c) => set('couleur', c === 'white' ? '' : c)} tabs={COLOR_TABS} />
      </form>

      {/* Once typing, what is typed is also the name of an empty repertoire of the side chosen. */}
      {name && (
        <button type="button" className="create-row" onClick={() => create.mutate()} disabled={create.isPending}>
          <span className="create-icon" aria-hidden="true"><Icon name="plus" size={18} /></span>
          <span className="create-text">
            <strong>Créer « {name} » avec les {side}</strong>
            <span className="muted small-text">Répertoire vide : vous ajoutez vos coups dans l’éditeur. Entrée pour créer.</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}
      {create.error && <p className="error">{create.error.message}</p>}

      <div className="catalogue-head">
        <h3>{q ? `Ou partir d’une étude Lichess pour les ${side}` : `Études Lichess populaires pour les ${side}`}</h3>
        <p className="muted small-text">
          {!q
            ? 'Les plus aimées, prêtes à importer et à réviser.'
            : list.isLoading
              ? `Recherche de « ${q} »…`
              : `Parmi ${plural(total, 'étude publique', 'études publiques')} pour « ${q} », les plus aimées d’abord : importez-en une avec ses lignes.`}
        </p>
      </div>
      {list.isLoading && <StudyGridSkeleton />}
      {list.error && <p className="error">{list.error.message}</p>}
      {list.data && studies.length === 0 && <p className="muted catalogue-empty">Aucune étude trouvée.</p>}
      {studies.length > 0 && (
        <div className="study-grid">
          {studies.map((s) => <StudyCard key={s.id} study={s} color={color} onOpen={() => onOpen({ studyId: s.id })} />)}
        </div>
      )}
      {list.hasNextPage && (
        <div className="catalogue-more">
          <Button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? 'Chargement…' : 'Plus d’études'}
          </Button>
        </div>
      )}
    </section>
  );
}

function StudyGridSkeleton() {
  return (
    <div className="study-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="study-card skeleton">
          <div className="study-thumb" />
          <div className="study-body"><span className="bar" /><span className="bar short" /></div>
        </div>
      ))}
    </div>
  );
}

/** A study: its thumbnail (where its lines split), name, likes, author, side and size. */
function StudyCard({ study, color, onOpen }: { study: LichessStudySummary; color: Color; onOpen: () => void }) {
  const preview = useQuery({
    queryKey: ['lichess-study-preview', study.id],
    queryFn: () => api.lichessStudyPreview(study.id),
    staleTime: 60 * 60_000,
    retry: false,
  });
  const p = preview.data;
  // Only the studies of the side chosen, once known (those not previewed yet stay, dimmed); a
  // study that cannot be exported (private, removed) could not be imported either.
  if ((p && p.color !== color) || preview.error) return null;
  return (
    <button type="button" className={`study-card ${p ? '' : 'pending'}`} onClick={onOpen} title={p?.trunk.sans.length ? lineText(p.trunk.sans) : study.name}>
      <div className="study-thumb">
        {p ? <MiniBoard fen={p.trunk.fen} orientation={p.color} arrows={arrowsOf(p.trunk)} /> : <div className={`thumb-placeholder ${preview.isLoading ? 'loading' : ''}`} />}
      </div>
      <div className="study-body">
        <span className="study-name">{study.name}</span>
        <span className="study-meta">♥ {likes(study.likes)} · {study.owner}</span>
        <span className="study-meta">
          {p ? (
            <>
              <span className={`dot ${p.color}`} /> {p.color === 'white' ? 'Blancs' : 'Noirs'} · {plural(p.chapters, 'chapitre', 'chapitres')}
            </>
          ) : (
            '…'
          )}
        </span>
      </div>
    </button>
  );
}

/**
 * A study opened: its chapters to choose from (those of the side chosen, joined to the others),
 * the board showing where they lead (the chapter under the pointer, else the selection), and
 * what will be imported.
 */
function StudyImport({
  studyId,
  chapterId,
  onBack,
  onCreated,
}: {
  studyId: string;
  chapterId?: string;
  onBack: () => void;
  onCreated: (rep: RepertoireSummary) => void;
}) {
  const study = useQuery({ queryKey: ['lichess-study', studyId], queryFn: () => api.lichessStudy(studyId), retry: false, staleTime: 10 * 60_000 });
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('white');
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);

  /** By default: the chapter of the link, else every chapter of this side that can join. */
  const defaults = (s: LichessStudy, c: Color) => {
    const only = chapterId ? s.chapters.findIndex((ch) => ch.id === chapterId) : -1;
    if (only >= 0) return new Set([only]);
    return new Set(s.chapters.flatMap((ch, i) => (ch.joins && ch.moves > 0 && (ch.orientation ?? s.color) === c ? [i] : [])));
  };
  useEffect(() => {
    const s = study.data;
    if (!s) return;
    setName(s.name.slice(0, 100));
    setColor(s.color);
    setChosen(defaults(s, s.color));
  }, [study.data]);

  const s = study.data;
  // What will be imported: distinct moves, how deep, and where the lines split.
  const selection = useMemo(() => {
    const picked = s ? s.chapters.filter((_, i) => chosen.has(i)) : [];
    const moves = picked.flatMap((c) => pgnToMoves(c.pgn).moves);
    return {
      moves: new Set(moves.map((m) => `${m.fromFen} ${m.uci}`)).size,
      maxPly: Math.max(0, ...picked.map((c) => c.maxPly)),
      trunk: trunkOf(moves),
    };
  }, [s, chosen]);

  const create = useMutation({
    mutationFn: async () => {
      const pgn = s!.chapters.filter((_, i) => chosen.has(i)).map((c) => c.pgn).join('\n\n');
      const rep = await api.createRepertoire(name.trim(), color);
      try {
        await api.importPgn(rep.id, pgn);
      } catch (e) {
        // No empty repertoire left behind.
        await api.deleteRepertoire(rep.id).catch(() => undefined);
        throw e;
      }
      return rep;
    },
    onSuccess: onCreated,
  });

  const toggle = (i: number) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const shown = hover !== null && s ? s.chapters[hover]!.trunk : selection.trunk;
  const caption =
    hover !== null && s ? s.chapters[hover]!.name : selection.trunk.sans.length ? lineText(selection.trunk.sans) : 'Position initiale';

  return (
    <div className="study-import">
      <div className="study-import-nav">
        <button type="button" className="link" onClick={onBack}>
          <Icon name="back" size={16} /> Toutes les études
        </button>
        <a className="small-text" href={`https://lichess.org/study/${studyId}`} target="_blank" rel="noreferrer">Voir sur Lichess ↗</a>
      </div>
      {study.isLoading && <p className="muted">Chargement de l’étude…</p>}
      {study.error && <p className="error">{study.error.message}</p>}
      {s && (
        <div className="study-import-body">
          <figure className="study-board">
            <MiniBoard className="mini-board-large" fen={shown.fen} orientation={color} arrows={arrowsOf(shown)} />
            <figcaption className="muted small-text">{caption}</figcaption>
          </figure>
          <form
            className="study-form stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && chosen.size) create.mutate();
            }}
          >
            <label className="field">
              <span className="field-label">Nom du répertoire</span>
              <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="field">
              <span className="field-label">Je joue</span>
              <Tabs
                block
                value={color}
                onChange={(c) => {
                  setColor(c);
                  setChosen(defaults(s, c));
                }}
                tabs={COLOR_TABS}
              />
            </div>
            <div className="field">
              <span className="field-label">Chapitres</span>
              <ul className="chapter-list" onMouseLeave={() => setHover(null)}>
                {s.chapters.map((c, i) => {
                  const usable = c.joins && c.moves > 0;
                  return (
                    <li key={i} onMouseEnter={() => setHover(i)}>
                      <label
                        className={`chapter ${chosen.has(i) ? 'on' : ''} ${usable ? '' : 'disabled'}`}
                        title={!c.joins ? 'Commence à une position qu’aucun autre chapitre n’atteint : ses coups ne peuvent pas rejoindre le répertoire.' : c.moves === 0 ? 'Chapitre sans coups' : undefined}
                      >
                        <input type="checkbox" checked={chosen.has(i)} disabled={!usable} onChange={() => toggle(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                        <span className="chapter-name">{c.name}</span>
                        {/* Only a chapter studied from the other side is marked. */}
                        {c.orientation && c.orientation !== color && (
                          <span className="chapter-side" title="Chapitre étudié avec l’autre couleur">
                            <span className={`dot ${c.orientation}`} /> {c.orientation === 'white' ? 'Blancs' : 'Noirs'}
                          </span>
                        )}
                        <span className="chapter-moves">{c.moves ? plural(c.moves, 'coup', 'coups') : 'sans coups'}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="import-summary">
              {chosen.size ? (
                <>
                  <strong>{plural(chosen.size, 'chapitre', 'chapitres')}</strong> · {plural(selection.moves, 'coup', 'coups')}
                  {selection.maxPly > 0 && <> · lignes jusqu’au {Math.ceil(selection.maxPly / 2)}<sup>e</sup> coup</>}
                </>
              ) : (
                'Choisissez au moins un chapitre.'
              )}
            </div>
            <Button type="submit" variant="primary" block disabled={!name.trim() || chosen.size === 0 || create.isPending}>
              {create.isPending ? 'Import…' : 'Importer dans mes répertoires'}
            </Button>
            {create.error && <p className="error">{create.error.message}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
