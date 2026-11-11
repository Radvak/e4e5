import type { Color } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export function RepertoireList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
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
      <h2>Your repertoires</h2>
      {isLoading && <p>Loading…</p>}
      {!isLoading && data.length === 0 && <p className="muted">No repertoire yet: create one below.</p>}
      <ul className="repertoires">
        {data.map((r) => (
          <li key={r.id}>
            <span className={`dot ${r.color}`} />
            <Link to={`/r/${r.id}`}>{r.name}</Link>
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
