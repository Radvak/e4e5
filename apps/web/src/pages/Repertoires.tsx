import type { Color } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Me, type RepertoireSummary, type TrainingSummary } from '../api';
import { useTrainingSummary } from '../useTrainingSummary';
import { Button, EmptyState, PageHeader, Switch, Tabs, plural } from '../ui';
import { useGaps } from '../useGaps';

const COLORS: { color: Color; label: string }[] = [
  { color: 'white', label: 'Avec les Blancs' },
  { color: 'black', label: 'Avec les Noirs' },
];

export function Repertoires({ me }: { me: Me }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const summary = useTrainingSummary(me);
  const counts = new Map((summary.data ?? []).map((s) => [s.repertoireId, s]));
  const gaps = useGaps(me, (reps.data?.length ?? 0) > 0);
  // Missing moves of each repertoire: frequent opponent moves it does not answer (gap finder).
  const missing = new Map<string, number>();
  for (const g of [...(gaps.data?.white?.gaps ?? []), ...(gaps.data?.black?.gaps ?? [])]) {
    if (g.repertoireId) missing.set(g.repertoireId, (missing.get(g.repertoireId) ?? 0) + 1);
  }
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
                  missing={gaps.data ? missing.get(r.id) ?? 0 : undefined}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RepertoireCard({ rep, counts, missing }: { rep: RepertoireSummary; counts?: TrainingSummary; missing?: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.setRepertoireActive(rep.id, !rep.active),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['repertoires'] }), qc.invalidateQueries({ queryKey: ['training-summary'] }), qc.invalidateQueries({ queryKey: ['games-report'] })]),
  });
  // The whole card opens the repertoire; the switch stops the click.
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`card rep-card clickable ${rep.active ? '' : 'paused'}`} onClick={() => navigate(`/r/${rep.id}`)}>
      <span className={`dot ${rep.color}`} />
      <div className="info">
        <Link className="name" to={`/r/${rep.id}`} onClick={stop}>{rep.name}</Link>
        <div className="meta">
          {counts ? plural(counts.totalLines, 'ligne', 'lignes') : '…'}
          {!rep.active && <> · en pause</>}
          {rep.active && counts && counts.dueLines > 0 && (
            <> · <span className="due" title="Lignes à revoir aujourd’hui">{counts.dueLines} à revoir</span></>
          )}
          {rep.active && counts && counts.newLines > 0 && <> · {plural(counts.newLines, 'nouvelle', 'nouvelles')}</>}
          {!!missing && (
            <>
              {' · '}
              <span className="missing" title="Coups adverses fréquents que ce répertoire ne prévoit pas encore">
                {plural(missing, 'coup manquant', 'coups manquants')}
              </span>
            </>
          )}
        </div>
      </div>
      <div onClick={stop}>
        <Switch
          on={rep.active}
          disabled={toggle.isPending}
          onChange={() => toggle.mutate()}
          label={rep.active ? `Mettre ${rep.name} en pause` : `Reprendre l’entraînement de ${rep.name}`}
        />
      </div>
    </div>
  );
}
