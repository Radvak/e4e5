import { lichessStudyRef, pgnToMoves, trunkOf, type ChapterKind, type Color, type Thumbnail } from '@tabiya/core';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type LichessStudy, type Me, type RepertoireSummary } from '../api';
import { lineText } from '../chessText';
import { MiniBoard } from '../components/MiniBoard';
import { canSearchLichess, searchLichessStudies, studyHint } from '../lichessSearch';
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

const arrowsOf = (t: Thumbnail) => t.branches.map((uci) => ({ uci, kind: 'repertoire' as const }));
const COLOR_TABS = [
  { id: 'white' as const, label: <><span className="dot white" /> Blancs</> },
  { id: 'black' as const, label: <><span className="dot black" /> Noirs</> },
];

/**
 * New repertoire, from one search field: what is typed is the name of an empty repertoire to
 * create (Entrée, or the "Créer" row) and searches the Lichess studies (all of them in the native
 * app, my own ones everywhere); a pasted study link opens it. A study opens its chapters to choose from (?etude=, ?chapitre= for a
 * chapter link).
 */
export function NewRepertoire({ me }: { me: Me }) {
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
        <Catalogue me={me} onOpen={openStudy} onCreated={created} />
      )}
    </div>
  );
}

/** Lower case without accents, for the search. */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const monthYear = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
const likes = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : String(n));
/** Rows shown before "Afficher plus" (my studies). */
const SHOWN = 40;

type Source = 'lichess' | 'mine';

/**
 * The search field with the side (the empty repertoire's), the empty repertoire named after
 * what is typed ("Créer « … »", once typing), and the Lichess studies to start from: all authors,
 * most liked first, searched from the device (native app only, see lichessSearch.ts), and my own
 * studies (official API, filtered by what is typed). A pasted study link opens it.
 */
function Catalogue({ me, onOpen, onCreated }: { me: Me; onOpen: (ref: { studyId: string; chapterId?: string }) => void; onCreated: (rep: RepertoireSummary) => void }) {
  const [params, setParams] = useSearchParams();
  // Typed into local state (the URL lags behind fast typing), copied to the URL (?q=) to come back to.
  const [input, setInput] = useState(() => params.get('q') ?? '');
  const color: Color = params.get('couleur') === 'black' ? 'black' : 'white';
  const mine = me.lichess?.username;
  const native = canSearchLichess();
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

  // All of Lichess when it can be searched (native app), else my studies.
  const sources: Source[] = [...(native ? (['lichess'] as const) : []), ...(mine ? (['mine'] as const) : [])];
  const source: Source | undefined = sources.find((x) => x === params.get('source')) ?? sources[0];
  const create = useMutation({ mutationFn: () => api.createRepertoire(name, color), onSuccess: onCreated });
  const side = color === 'white' ? 'Blancs' : 'Noirs';

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
            placeholder={native ? 'Nom du répertoire ou ouverture à chercher (Caro-Kann…)' : 'Nom du répertoire, ou lien d’une étude Lichess'}
            aria-label="Nom du répertoire, ou étude Lichess à chercher"
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
        <h3>{name ? 'Ou partir d’une étude Lichess' : 'Partir d’une étude Lichess'}</h3>
        {sources.length > 1 && (
          <div className="author-chips" role="tablist" aria-label="Études">
            {sources.map((x) => (
              <button key={x} type="button" role="tab" aria-selected={x === source} className={`chip ${x === source ? 'on' : ''}`} onClick={() => set('source', x === sources[0] ? '' : x)}>
                {x === 'lichess' ? 'Toutes les études' : 'Mes études'}
              </button>
            ))}
          </div>
        )}
      </div>
      {source === 'lichess' && <LichessResults q={q} onOpen={onOpen} />}
      {source === 'mine' && <MyStudies username={mine!} name={name} onOpen={onOpen} />}
      {!source && (
        <p className="muted catalogue-empty">
          Collez le lien d’une étude Lichess (lichess.org/study/…) pour l’importer
          {me.lichess ? '.' : ', ou liez votre compte Lichess (Compte) pour retrouver vos études ici.'}
        </p>
      )}
    </section>
  );
}

/** Lichess's own search, from the device: all authors, most liked first, page by page. */
function LichessResults({ q, onOpen }: { q: string; onOpen: (ref: { studyId: string }) => void }) {
  const list = useInfiniteQuery({
    queryKey: ['lichess-search', q],
    queryFn: ({ pageParam }) => searchLichessStudies(q, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.nbPages ? last.page + 1 : undefined),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const studies = list.data?.pages.flatMap((p) => p.studies) ?? [];
  const total = list.data?.pages[0]?.nbResults ?? 0;
  return (
    <>
      <p className="muted small-text catalogue-note">
        {list.isLoading ? (q ? `Recherche de « ${q} »…` : 'Chargement…') : q ? `${plural(total, 'étude', 'études')} pour « ${q} », les plus aimées d’abord.` : 'Les plus aimées de Lichess.'}
      </p>
      {list.error && <p className="error">{list.error.message}</p>}
      {list.data && studies.length === 0 && <p className="muted catalogue-empty">Aucune étude trouvée.</p>}
      {studies.length > 0 && (
        <ul className="study-rows">
          {studies.map((s) => {
            const hint = studyHint(s.topics);
            return (
              <li key={s.id}>
                <button type="button" className={`study-row ${hint ? 'other' : ''}`} onClick={() => onOpen({ studyId: s.id })}>
                  <span className="study-text">
                    <span className="study-name">
                      {s.name}
                      {hint && <span className="study-hint" title="D’après ses thèmes, pas une étude d’ouverture">{hint}</span>}
                    </span>
                    <span className="study-meta">♥ {likes(s.likes)} · {s.owner}{s.topics.length > 0 && ` · ${s.topics.slice(0, 2).join(', ')}`}</span>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {list.hasNextPage && (
        <div className="catalogue-more">
          <Button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? 'Chargement…' : 'Plus d’études'}
          </Button>
        </div>
      )}
    </>
  );
}

/** My public Lichess studies (official API), most recent first, filtered by what is typed. */
function MyStudies({ username, name, onOpen }: { username: string; name: string; onOpen: (ref: { studyId: string }) => void }) {
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [name]);
  const list = useQuery({
    queryKey: ['lichess-studies-by', username.toLowerCase()],
    queryFn: () => api.lichessStudiesBy(username),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const words = norm(name).split(/\s+/).filter(Boolean);
  const matching = (list.data ?? []).filter((s) => words.every((w) => norm(s.name).includes(w)));
  const shown = all ? matching : matching.slice(0, SHOWN);
  return (
    <>
      <p className="muted small-text catalogue-note">
        {list.isLoading
          ? 'Chargement de vos études…'
          : list.data && list.data.length > 0
            ? name
              ? matching.length
                ? `${plural(matching.length, 'de vos études contient', 'de vos études contiennent')} « ${name} ».`
                : ''
              : `Vos ${plural(list.data.length, 'étude publique', 'études publiques')} sur Lichess, les plus récentes d’abord.`
            : ''}
      </p>
      {list.error && <p className="error">{list.error.message}</p>}
      {list.data && matching.length === 0 && (
        <p className="muted catalogue-empty">{name && list.data.length ? `Aucune de vos études ne contient « ${name} ».` : 'Vous n’avez pas d’étude publique sur Lichess.'}</p>
      )}
      {shown.length > 0 && (
        <ul className="study-rows">
          {shown.map((s) => (
            <li key={s.id}>
              <button type="button" className="study-row" onClick={() => onOpen({ studyId: s.id })}>
                <span className="study-text">
                  <span className="study-name">{s.name}</span>
                  <span className="study-meta">{monthYear(s.updatedAt)}</span>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!all && matching.length > SHOWN && (
        <div className="catalogue-more">
          <Button onClick={() => setAll(true)}>{plural(matching.length - SHOWN, 'autre étude', 'autres études')}</Button>
        </div>
      )}
    </>
  );
}

/**
 * A study opened: its chapters to choose from (those of the side chosen, joined to the others),
 * the board showing where they lead (the chapter under the pointer, else the selection), and
 * what will be imported.
 */
/** The groups of chapters, in this order, and why a kind cannot join a repertoire. */
const KINDS: { kind: ChapterKind; label: string; why?: string }[] = [
  { kind: 'opening', label: 'Ouvertures' },
  { kind: 'game', label: 'Parties commentées' },
  { kind: 'endgame', label: 'Finales', why: 'Finale : commence à sa propre position, ses coups ne peuvent pas rejoindre un répertoire d’ouverture.' },
  { kind: 'position', label: 'Positions (milieu de jeu, tactique…)', why: 'Commence à une position qu’aucun autre chapitre n’atteint : ses coups ne peuvent pas rejoindre le répertoire.' },
];

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

  /**
   * By default: the chapter of the link, else the opening chapters of this side (the commented
   * games can join too, but are checked by hand: one long line is not a repertoire).
   */
  const defaults = (s: LichessStudy, c: Color) => {
    const only = chapterId ? s.chapters.findIndex((ch) => ch.id === chapterId) : -1;
    if (only >= 0 && s.chapters[only]!.joins) return new Set([only]);
    return new Set(s.chapters.flatMap((ch, i) => (ch.joins && ch.kind === 'opening' && ch.moves > 0 && (ch.orientation ?? s.color) === c ? [i] : [])));
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
              <div className="chapter-groups" onMouseLeave={() => setHover(null)}>
                {KINDS.map(({ kind, label, why }) => {
                  const group = s.chapters.flatMap((c, i) => (c.kind === kind ? [{ c, i }] : []));
                  if (!group.length) return null;
                  // Headings only when the study mixes kinds (a pure opening study stays a plain list).
                  const mixed = s.chapters.some((c) => c.kind !== 'opening');
                  return (
                    <section key={kind} className="chapter-group">
                      {mixed && (
                        <h4 className="chapter-group-title">
                          {label} <span className="muted">· {group.length}</span>
                        </h4>
                      )}
                      <ul className="chapter-list">
                        {group.map(({ c, i }) => {
                          const usable = c.joins && c.moves > 0;
                          return (
                            <li key={i} onMouseEnter={() => setHover(i)}>
                              <label
                                className={`chapter ${chosen.has(i) ? 'on' : ''} ${usable ? '' : 'disabled'}`}
                                title={
                                  !c.joins
                                    ? why ?? KINDS.at(-1)!.why
                                    : c.moves === 0
                                      ? 'Chapitre sans coups'
                                      : kind === 'game'
                                        ? 'Partie : une longue ligne, pas cochée par défaut'
                                        : undefined
                                }
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
                    </section>
                  );
                })}
              </div>
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
