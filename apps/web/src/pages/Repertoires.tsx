import { START_FEN, type Color } from '@tabiya/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Me, type RepertoireSummary, type TrainingSummary } from '../api';
import { useTrainingSummary } from '../useTrainingSummary';
import { Button, EmptyState, Icon, PageHeader, Switch, Tabs, plural } from '../ui';
import { useGaps } from '../useGaps';
import { lineText } from '../chessText';
import { MiniBoard } from '../components/MiniBoard';

const COLORS: { color: Color; label: string }[] = [
  { color: 'white', label: 'Avec les Blancs' },
  { color: 'black', label: 'Avec les Noirs' },
];

type ColorFilter = 'all' | Color;
type StatusFilter = 'all' | 'due' | 'new' | 'missing' | 'active' | 'paused';
type Sort = 'name' | 'due' | 'lines' | 'recent';

const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Tous les états' },
  { id: 'due', label: 'À revoir' },
  { id: 'new', label: 'Nouvelles lignes' },
  { id: 'missing', label: 'Coups manquants' },
  { id: 'active', label: 'En entraînement' },
  { id: 'paused', label: 'En pause' },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Plus récents' },
  { id: 'name', label: 'Nom' },
  { id: 'due', label: 'À revoir' },
  { id: 'lines', label: 'Nombre de lignes' },
];

/** Lower case without accents, for the search. */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const oneOf = <T extends string>(v: string | null, ids: readonly T[], def: T): T => (ids.includes(v as T) ? (v as T) : def);

export function Repertoires({ me }: { me: Me }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const summary = useTrainingSummary(me);
  const counts = new Map((summary.data ?? []).map((s) => [s.repertoireId, s]));
  const gaps = useGaps(me, (reps.data?.length ?? 0) > 0);
  // Missing moves of each repertoire: frequent opponent moves it does not answer (gap finder).
  // The gaps come most frequent first: the first one of a repertoire is the one its badge opens.
  const missing = new Map<string, number>();
  const firstGap = new Map<string, string[]>();
  for (const g of [...(gaps.data?.white?.gaps ?? []), ...(gaps.data?.black?.gaps ?? [])]) {
    if (!g.repertoireId) continue;
    missing.set(g.repertoireId, (missing.get(g.repertoireId) ?? 0) + 1);
    if (!firstGap.has(g.repertoireId)) firstGap.set(g.repertoireId, g.move ? [...g.ucis, g.move.uci] : g.ucis);
  }
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('white');

  // Filters live in the URL: they survive opening a repertoire and coming back.
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const colorFilter = oneOf<ColorFilter>(params.get('couleur'), ['all', 'white', 'black'], 'all');
  const status = oneOf<StatusFilter>(params.get('etat'), STATUSES.map((s) => s.id), 'all');
  const sort = oneOf<Sort>(params.get('tri'), SORTS.map((s) => s.id), 'recent');
  const setParam = (key: string, value: string, def: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === def) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const refresh = () => qc.invalidateQueries({ queryKey: ['repertoires'] });
  const create = useMutation({
    mutationFn: () => api.createRepertoire(name.trim(), color),
    onSuccess: async (rep) => {
      await refresh();
      navigate(`/r/${rep.id}`);
    },
  });

  const list = reps.data ?? [];
  const byColor = (c: Color) => list.filter((r) => r.color === c).length;
  const q = norm(query.trim());
  const matches = (r: RepertoireSummary) => {
    if (q && !norm(r.name).includes(q)) return false;
    if (colorFilter !== 'all' && r.color !== colorFilter) return false;
    const c = counts.get(r.id);
    switch (status) {
      case 'due': return r.active && !!c && c.dueLines > 0;
      case 'new': return r.active && !!c && c.newLines > 0;
      case 'missing': return (missing.get(r.id) ?? 0) > 0;
      case 'active': return r.active;
      case 'paused': return !r.active;
      default: return true;
    }
  };
  const byName = (a: RepertoireSummary, b: RepertoireSummary) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
  const compare = (a: RepertoireSummary, b: RepertoireSummary) => {
    const ca = counts.get(a.id);
    const cb = counts.get(b.id);
    switch (sort) {
      case 'due': {
        const due = (r: RepertoireSummary, c?: TrainingSummary) => (r.active && c ? c.dueLines : -1);
        return due(b, cb) - due(a, ca) || byName(a, b);
      }
      case 'lines': return (cb?.totalLines ?? -1) - (ca?.totalLines ?? -1) || byName(a, b);
      case 'recent': return b.createdAt.localeCompare(a.createdAt) || byName(a, b);
      default: return byName(a, b);
    }
  };
  const shown = list.filter(matches).sort(compare);
  const filtered = q !== '' || colorFilter !== 'all' || status !== 'all';
  const statusOptions = STATUSES.filter((s) => s.id !== 'missing' || gaps.data);

  return (
    <div className="narrow-page">
      <PageHeader
        title="Répertoires"
        subtitle={list.length ? plural(list.length, 'répertoire', 'répertoires') : undefined}
        actions={list.length > 0 && <Button variant="primary" icon="plus" onClick={() => setCreating(!creating)}>Nouveau</Button>}
      />

      {creating && (
        <form
          className="card stack"
          style={{ marginBottom: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <h3>Nouveau répertoire</h3>
          <input autoFocus placeholder="Nom (par ex. Sicilienne Najdorf)" value={name} onChange={(e) => setName(e.target.value)} />
          <Tabs
            block
            value={color}
            onChange={setColor}
            tabs={[
              { id: 'white', label: <><span className="dot white" /> Blancs</> },
              { id: 'black', label: <><span className="dot black" /> Noirs</> },
            ]}
          />
          <div className="row">
            <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>Créer</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          </div>
          {create.error && <p className="error">{create.error.message}</p>}
        </form>
      )}

      {reps.isLoading && <p className="muted">Chargement…</p>}
      {!reps.isLoading && list.length === 0 && (
        <EmptyState
          title="Aucun répertoire"
          action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Créer un répertoire</Button>}
        >
          Un répertoire regroupe vos coups pour une couleur (par exemple « 1.e4 avec les Blancs »). Vous pourrez y importer un PGN.
        </EmptyState>
      )}

      {list.length > 0 && (
        <div className="rep-toolbar">
          <label className="rep-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              placeholder="Rechercher un répertoire"
              aria-label="Rechercher un répertoire"
              value={query}
              onChange={(e) => setParam('q', e.target.value, '')}
            />
          </label>
          <Tabs
            value={colorFilter}
            onChange={(v) => setParam('couleur', v, 'all')}
            tabs={[
              { id: 'all', label: <>Tous <span className="count">{list.length}</span></> },
              { id: 'white', label: <><span className="dot white" /> Blancs <span className="count">{byColor('white')}</span></> },
              { id: 'black', label: <><span className="dot black" /> Noirs <span className="count">{byColor('black')}</span></> },
            ]}
          />
          <div className="rep-selects">
            <select aria-label="Filtrer par état" value={status} onChange={(e) => setParam('etat', e.target.value, 'all')}>
              {statusOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select aria-label="Trier" value={sort} onChange={(e) => setParam('tri', e.target.value, 'recent')}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>Tri : {s.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {list.length > 0 && filtered && (
        <div className="rep-results muted">
          {shown.length ? `${shown.length} sur ${list.length}` : 'Aucun répertoire ne correspond'}
          <button type="button" className="link" onClick={() => setParams({}, { replace: true })}>Effacer les filtres</button>
        </div>
      )}

      {/* Grouped by colour when both are shown, a single list otherwise. */}
      {(colorFilter === 'all' ? COLORS : COLORS.filter((c) => c.color === colorFilter)).map(({ color: c, label }) => {
        const own = shown.filter((r) => r.color === c);
        if (!own.length) return null;
        return (
          <section key={c}>
            {colorFilter === 'all' && <h4 className="section-title">{label} <span className="count">{own.length}</span></h4>}
            <div className="rep-list">
              {own.map((r) => (
                <RepertoireRow
                  key={r.id}
                  rep={r}
                  counts={counts.get(r.id)}
                  missing={gaps.data ? missing.get(r.id) ?? 0 : undefined}
                  firstGap={firstGap.get(r.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RepertoireRow({ rep, counts, missing, firstGap }: {
  rep: RepertoireSummary;
  counts?: TrainingSummary;
  missing?: number;
  /** Line (UCI) of the most frequent missing move, the move included. */
  firstGap?: string[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.setRepertoireActive(rep.id, !rep.active),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['repertoires'] }), qc.invalidateQueries({ queryKey: ['training-summary'] }), qc.invalidateQueries({ queryKey: ['games-report'] })]),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteRepertoire(rep.id),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['repertoires'] }), qc.invalidateQueries({ queryKey: ['training-summary'] }), qc.invalidateQueries({ queryKey: ['games-report'] })]),
  });
  const askDelete = () => {
    if (confirm(`Supprimer le répertoire « ${rep.name} » et tous ses coups ?`)) remove.mutate();
  };
  // Long press (touch) or right click (mouse) offers to delete the repertoire.
  // The click that ends a long press is swallowed so the row does not open.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onTouchStart = (e: React.TouchEvent) => {
    fired.current = false;
    const t = e.touches[0];
    cancelPress();
    if (!t || e.touches.length > 1) return;
    press.current = {
      x: t.clientX,
      y: t.clientY,
      timer: window.setTimeout(() => {
        press.current = null;
        fired.current = true;
        navigator.vibrate?.(15);
        askDelete();
      }, 550),
    };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t && press.current && Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > 10) cancelPress();
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (!fired.current) return;
    fired.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // On touch screens the long press timer already asked (Android also fires contextmenu).
    if (fired.current || press.current) return;
    askDelete();
  };
  const arrows = (rep.branches ?? []).map((uci) => ({ uci, kind: 'repertoire' as const }));
  // The whole row opens the repertoire; the switch stops the click.
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const go = (to: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(to);
  };
  return (
    <div
      className={`rep-row ${rep.active ? '' : 'paused'}`}
      onClick={() => navigate(`/r/${rep.id}`)}
      onClickCapture={onClickCapture}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onContextMenu={onContextMenu}
    >
      <div className="rep-thumb" title={rep.trunk?.length ? lineText(rep.trunk) : 'Position initiale'}>
        <MiniBoard fen={rep.trunkFen ?? START_FEN} orientation={rep.color} arrows={arrows} />
      </div>
      <div className="info">
        <Link className="name" to={`/r/${rep.id}`} onClick={stop}>{rep.name}</Link>
        <div className="meta">{counts ? `${plural(counts.totalLines, 'ligne', 'lignes')} (${plural(counts.positions, 'position', 'positions')})` : '…'}</div>
        {/* Memorized share of the positions trained (at the depth of the lines, Paramètres). */}
        {counts && counts.total > 0 && (
          <div
            className="meta"
            title="Chance estimée de trouver votre coup aujourd’hui, en moyenne sur les positions entraînées (0 pour celles pas encore apprises). Positions entraînées : selon la profondeur des lignes choisie dans les Paramètres."
          >
            Mémorisé à <strong className="known">{Math.round(100 * counts.known)} %</strong> sur {plural(counts.total, 'position', 'positions')}
          </div>
        )}
        {/* Clickable: review this repertoire, or open the editor on its most frequent missing move. */}
        <div className="badges">
          {rep.active && counts && counts.dueLines > 0 && (
            <button type="button" className="badge warn" title="Réviser les lignes à revoir aujourd’hui" onClick={go(`/r/${rep.id}/train?mode=review`)}>
              {counts.dueLines} à revoir
            </button>
          )}
          {rep.active && counts && counts.newLines > 0 && (
            <button type="button" className="badge" title="Apprendre les lignes pas encore apprises" onClick={go(`/r/${rep.id}/train?mode=review`)}>
              {plural(counts.newLines, 'nouvelle', 'nouvelles')}
            </button>
          )}
          {!!missing && (
            <button
              type="button"
              className="badge hole"
              title="Coups adverses fréquents que ce répertoire ne prévoit pas encore : ouvrir le plus fréquent"
              onClick={go(firstGap ? `/r/${rep.id}?${new URLSearchParams({ line: firstGap.join(',') })}` : `/r/${rep.id}`)}
            >
              {plural(missing, 'coup manquant', 'coups manquants')}
            </button>
          )}
        </div>
        <div className="toggle" onClick={stop}>
          <Switch
            on={rep.active}
            disabled={toggle.isPending}
            onChange={() => toggle.mutate()}
            label={rep.active ? `Mettre ${rep.name} en pause` : `Reprendre l’entraînement de ${rep.name}`}
          />
          <span>{rep.active ? 'En entraînement' : 'En pause'}</span>
        </div>
      </div>
    </div>
  );
}
