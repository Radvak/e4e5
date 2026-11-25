/**
 * Moves chapters to another repertoire of their colour, or to a new one: to group chapters into
 * repertoires (like the chapters of a Lichess study). The training progress stays (the cards
 * belong to the positions, not to the repertoires).
 */
import type { Color } from '@e4e5/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { t } from '../i18n';
import { Button, plural } from '../ui';

export function MoveChaptersDialog({
  chapterIds,
  color,
  from,
  onMoved,
  onClose,
}: {
  chapterIds: string[];
  color: Color;
  /** The repertoire of the chapters, not offered (when they are all in one). */
  from?: string;
  onMoved: (repertoireId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const close = () => ref.current?.close();
  const qc = useQueryClient();
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const targets = (reps.data ?? []).filter((r) => r.color === color && r.id !== from);
  const [newName, setNewName] = useState('');
  const move = useMutation({
    mutationFn: async (target: { id: string } | { name: string }) => {
      const id = 'id' in target ? target.id : (await api.createRepertoire(target.name, color)).id;
      await api.moveChapters(chapterIds, id);
      return id;
    },
    onSuccess: async (id) => {
      for (const key of ['repertoire', 'training-summary', 'gaps', 'games-report']) void qc.invalidateQueries({ queryKey: [key] });
      await qc.invalidateQueries({ queryKey: ['repertoires'] });
      onMoved(id);
      close();
    },
  });
  return (
    <dialog
      ref={ref}
      className="game-detail move-actions-dialog"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && close()}
    >
      <div className="game-detail-content stack">
        <p className="move-actions-title">
          <strong>
            {t(
              `Déplacer ${plural(chapterIds.length, 'chapitre', 'chapitres')} vers…`,
              `Move ${plural(chapterIds.length, 'chapter', 'chapters')} to…`,
            )}
          </strong>
        </p>
        <div className="move-actions-list">
          {targets.map((r) => (
            <button key={r.id} type="button" className="move-action" disabled={move.isPending} onClick={() => move.mutate({ id: r.id })}>
              <span className={`dot inline ${r.color}`} /> {r.name}
              <span className="muted small-text">{t(plural(r.chapters?.length ?? 0, 'chapitre', 'chapitres'), plural(r.chapters?.length ?? 0, 'chapter', 'chapters'))}</span>
            </button>
          ))}
          {reps.data && !targets.length && (
            <p className="muted small-text">{t('Aucun autre répertoire de cette couleur : créez-en un.', 'No other repertoire of this colour: create one.')}</p>
          )}
        </div>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) move.mutate({ name: newName.trim() });
          }}
        >
          <input placeholder={t('Nouveau répertoire', 'New repertoire')} value={newName} onChange={(e) => setNewName(e.target.value)} aria-label={t('Nom du nouveau répertoire', 'Name of the new repertoire')} />
          <Button type="submit" size="sm" disabled={!newName.trim() || move.isPending}>{t('Créer et déplacer', 'Create and move')}</Button>
        </form>
        {move.error && <p className="error small-text">{move.error.message}</p>}
        <div className="row move-actions-footer">
          <Button variant="ghost" onClick={close}>{t('Annuler', 'Cancel')}</Button>
        </div>
      </div>
    </dialog>
  );
}
