import { lichessStudyRef, pgnToMoves, trunkOf, type Color, type Thumbnail } from '@tabiya/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type LichessStudy, type Me, type RepertoireSummary } from '../api';
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

const arrowsOf = (t: Thumbnail) => t.branches.map((uci) => ({ uci, kind: 'repertoire' as const }));
const COLOR_TABS = [
  { id: 'white' as const, label: <><span className="dot white" /> Blancs</> },
  { id: 'black' as const, label: <><span className="dot black" /> Noirs</> },
];

/**
 * New repertoire, from one search field: what is typed is the name of an empty repertoire to
 * create (Entrée, or the "Créer" row) and filters the Lichess studies of an author; a pasted
 * study link opens it. A study opens its chapters to choose from (?etude=, ?chapitre= for a
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

/**
 * Authors of popular Lichess studies, offered to browse (the official API lists a player's
 * studies but has no search nor popularity ranking).
 */
const AUTHORS = ['LeninPerez', 'Toxenory', 'EricRosen', 'FunnyAnimatorJimTV', 'Mr_Penings', 'Yonushke'];

/** Lower case without accents, for the search. */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const monthYear = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
/** Rows shown before "Afficher plus". */
const SHOWN = 40;

/**
 * The search field with the side (the empty repertoire's), the empty repertoire named after
 * what is typed ("Créer « … »", once typing), and the Lichess studies of an author (one request
 * per author), filtered by what is typed. "@pseudo" lists any player's studies.
 */
function Catalogue({ me, onOpen, onCreated }: { me: Me; onOpen: (ref: { studyId: string; chapterId?: string }) => void; onCreated: (rep: RepertoireSummary) => void }) {
  const [params, setParams] = useSearchParams();
  // Typed into local state (the URL lags behind fast typing), copied to the URL (?q=) to come back to.
  const [input, setInput] = useState(() => params.get('q') ?? '');
  const color: Color = params.get('couleur') === 'black' ? 'black' : 'white';
  const mine = me.lichess?.username;
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
  // "@pseudo": a player whose studies to list, not a name nor a filter.
  const at = input.trim().match(/^@([A-Za-z0-9_-]{2,30})$/)?.[1];
  const name = ref || input.trim().startsWith('@') ? '' : input.trim().slice(0, 100);
  const typed = useDebounced(input, 300);
  useEffect(() => {
    if (ref) onOpen(ref);
  }, [ref?.studyId, ref?.chapterId]);
  useEffect(() => {
    if (!ref) set('q', typed.trim());
  }, [typed]);
  const atDebounced = useDebounced(at, 500);
  useEffect(() => {
    if (atDebounced) set('auteur', atDebounced);
  }, [atDebounced]);

  const author = params.get('auteur') || mine || AUTHORS[0]!;
  const authors = [...new Set([...(mine ? [mine] : []), ...AUTHORS, author])];
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [author, name]);

  const create = useMutation({ mutationFn: () => api.createRepertoire(name, color), onSuccess: onCreated });
  const side = color === 'white' ? 'Blancs' : 'Noirs';
  const list = useQuery({
    queryKey: ['lichess-studies-by', author.toLowerCase()],
    queryFn: () => api.lichessStudiesBy(author),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const words = norm(name).split(/\s+/).filter(Boolean);
  const matching = (list.data ?? []).filter((s) => words.every((w) => norm(s.name).includes(w)));
  const shown = all ? matching : matching.slice(0, SHOWN);
  const who = author === mine ? 'vous' : author;

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
            placeholder="Nom du répertoire, étude à chercher, ou @pseudo Lichess"
            aria-label="Nom du répertoire, étude à chercher, ou pseudo Lichess"
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
        <div className="author-chips" role="tablist" aria-label="Auteur des études">
          {authors.map((a) => (
            <button key={a} type="button" role="tab" aria-selected={a === author} className={`chip ${a === author ? 'on' : ''}`} onClick={() => set('auteur', a === (mine ?? AUTHORS[0]) ? '' : a)}>
              {a === mine ? 'Mes études' : a}
            </button>
          ))}
        </div>
        <p className="muted small-text">
          {list.isLoading
            ? `Chargement des études de ${who}…`
            : list.data
              ? name
                ? matching.length
                  ? `${plural(matching.length, 'étude', 'études')} de ${who} sur ${list.data.length} ${matching.length > 1 ? 'contiennent' : 'contient'} « ${name} ».`
                  : ''
                : `${plural(list.data.length, 'étude publique', 'études publiques')} de ${who}, les plus récentes d’abord. Tapez pour filtrer, ou « @pseudo » pour un autre joueur.`
              : ''}
        </p>
      </div>
      {list.error && <p className="error">{list.error.message}</p>}
      {list.data && matching.length === 0 && (
        <p className="muted catalogue-empty">{name ? `Aucune étude de ${who} ne contient « ${name} ».` : `${who === 'vous' ? 'Vous n’avez' : `${who} n’a`} pas d’étude publique.`}</p>
      )}
      {shown.length > 0 && (
        <ul className="study-rows">
          {shown.map((s) => (
            <li key={s.id}>
              <button type="button" className="study-row" onClick={() => onOpen({ studyId: s.id })}>
                <span className="study-name">{s.name}</span>
                <span className="study-meta">{monthYear(s.updatedAt)}</span>
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
    </section>
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
