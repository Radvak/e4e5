import type { Color } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type RepertoireSummary, type TrainingSummary } from '../api';
import { dayStart, useSettings } from '../settings';
import { Button, EmptyState, Menu, PageHeader, Tabs, plural } from '../ui';

const COLORS: { color: Color; label: string }[] = [
  { color: 'white', label: 'Avec les Blancs' },
  { color: 'black', label: 'Avec les Noirs' },
];

export function Repertoires() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { newPerDay } = useSettings();
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const summary = useQuery({ queryKey: ['training-summary', newPerDay], queryFn: () => api.trainingSummary(dayStart(), newPerDay) });
  const counts = new Map((summary.data ?? []).map((s) => [s.repertoireId, s]));
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('white');

  const refresh = () => qc.invalidateQueries({ queryKey: ['repertoires'] });
  const create = useMutation({
    mutationFn: () => api.createRepertoire(name.trim(), color),
    onSuccess: async (rep) => {
      await refresh();
      navigate(`/r/${rep.id}`);
    },
  });
  const remove = useMutation({ mutationFn: api.deleteRepertoire, onSuccess: refresh });
  const rename = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.renameRepertoire(id, name), onSuccess: refresh });

  const list = reps.data ?? [];
  return (
    <div className="narrow-page">
      <PageHeader
        title="Répertoires"
        subtitle={list.length ? plural(list.length, 'répertoire', 'répertoires') : undefined}
        actions={<Button variant="primary" icon="plus" onClick={() => setCreating(!creating)}>Nouveau</Button>}
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

      {COLORS.map(({ color: c, label }) => {
        const own = list.filter((r) => r.color === c);
        if (!own.length) return null;
        return (
          <section key={c}>
            <h4 className="section-title">{label}</h4>
            <div className="stack">
              {own.map((r) => (
                <RepertoireCard
                  key={r.id}
                  rep={r}
                  counts={counts.get(r.id)}
                  onRename={() => {
                    const next = prompt('Nouveau nom', r.name)?.trim();
                    if (next && next !== r.name) rename.mutate({ id: r.id, name: next });
                  }}
                  onDelete={() => confirm(`Supprimer le répertoire « ${r.name} » et tous ses coups ?`) && remove.mutate(r.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RepertoireCard({ rep, counts, onRename, onDelete }: { rep: RepertoireSummary; counts?: TrainingSummary; onRename: () => void; onDelete: () => void }) {
  const navigate = useNavigate();
  const toTrain = counts ? counts.due + counts.new : 0;
  // The whole card opens the repertoire; its buttons stop the click.
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="card rep-card clickable" onClick={() => navigate(`/r/${rep.id}`)}>
      <span className={`dot ${rep.color}`} />
      <div className="info">
        <Link className="name" to={`/r/${rep.id}`} onClick={stop}>{rep.name}</Link>
        <div className="meta">
          {counts ? plural(counts.total, 'position', 'positions') : '…'}
          {counts && counts.due > 0 && <> · <span className="due">{counts.due} à revoir</span></>}
          {counts && counts.new > 0 && <> · {plural(counts.new, 'nouvelle', 'nouvelles')}</>}
        </div>
      </div>
      <div className="row nowrap" onClick={stop}>
        {toTrain > 0 && (
          <Button size="sm" variant={counts!.due > 0 ? 'primary' : 'secondary'} onClick={() => navigate(`/r/${rep.id}/train`)}>
            Entraîner
          </Button>
        )}
        <Menu
          items={[
            { label: 'Renommer', onClick: onRename },
            { label: 'Exporter en PGN', onClick: () => (location.href = `/api/repertoires/${rep.id}/pgn`) },
            { label: 'Supprimer', onClick: onDelete, danger: true },
          ]}
        />
      </div>
    </div>
  );
}
