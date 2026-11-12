import type { Color } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { dayStart, useSettings } from '../settings';

export function RepertoireList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const { newPerDay } = useSettings();
  const summary = useQuery({
    queryKey: ['training-summary', newPerDay],
    queryFn: () => api.trainingSummary(dayStart(), newPerDay),
  });
  const counts = new Map((summary.data ?? []).map((s) => [s.repertoireId, s]));
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('white');

  const create = useMutation({
    mutationFn: () => api.createRepertoire(name.trim(), color),
    onSuccess: (rep) => {
      qc.invalidateQueries({ queryKey: ['repertoires'] });
      navigate(`/r/${rep.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: api.deleteRepertoire,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repertoires'] }),
  });

  return (
    <div className="list">
      <div className="row">
        <h2>Your repertoires</h2>
        {(() => {
          const s = summary.data ?? [];
          const due = s.reduce((n, x) => n + x.due, 0);
          const fresh = s.reduce((n, x) => n + x.new, 0);
          return s.some((x) => x.total > 0) ? (
            <Link className="button train" to="/train">
              Train all{due + fresh > 0 ? ` (${due} due, ${fresh} new)` : ' ✓'}
            </Link>
          ) : null;
        })()}
      </div>
      {isLoading && <p>Loading…</p>}
      {!isLoading && data.length === 0 && <p className="muted">No repertoire yet: create one below.</p>}
      <ul className="repertoires">
        {data.map((r) => (
          <li key={r.id}>
            <span className={`dot ${r.color}`} />
            <Link to={`/r/${r.id}`}>{r.name}</Link>
            {counts.get(r.id) && counts.get(r.id)!.total > 0 && (
              <Link className="button small train" to={`/r/${r.id}/train`}>
                Train
                {counts.get(r.id)!.due + counts.get(r.id)!.new > 0
                  ? ` (${counts.get(r.id)!.due} due, ${counts.get(r.id)!.new} new)`
                  : ' ✓'}
              </Link>
            )}
            <button
              className="small danger"
              onClick={() => confirm(`Delete the repertoire "${r.name}"?`) && remove.mutate(r.id)}
            >
              delete
            </button>
          </li>
        ))}
      </ul>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <input placeholder="New repertoire name (e.g. 1.e4 for White)" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={color} onChange={(e) => setColor(e.target.value as Color)}>
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>
        <button type="submit" disabled={!name.trim() || create.isPending}>Create</button>
      </form>
    </div>
  );
}
