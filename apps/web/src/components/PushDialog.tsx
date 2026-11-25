/**
 * Push a repertoire to its Lichess study (app → Lichess), on demand: what each chapter does there
 * (its moves replace those of its chapter, or a new chapter), the moves only on Lichess that would
 * be lost, then the push. A repertoire without a study gets a new one (private by default).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type PushResult } from '../api';
import { t } from '../i18n';
import { Button, plural } from '../ui';

type Visibility = 'private' | 'unlisted' | 'public';

export function PushDialog({ repertoire, onClose }: { repertoire: { id: string; name: string }; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const close = () => ref.current?.close();
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ['push-plan', repertoire.id], queryFn: () => api.pushPlan(repertoire.id), retry: false, staleTime: 0, gcTime: 0 });
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [done, setDone] = useState<PushResult | null>(null);
  const push = useMutation({
    mutationFn: () => api.pushToLichess(repertoire.id, visibility),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['repertoire'] });
      void qc.invalidateQueries({ queryKey: ['repertoires'] });
      setDone(r);
    },
  });
  const error = push.error ?? plan.error;
  // Not allowed to write (account linked before the scope study:write, or no account): link again.
  const relink = error instanceof ApiError && (error.status === 401 || error.status === 403);
  const p = plan.data;
  const lost = p?.chapters.reduce((n, c) => n + c.lost, 0) ?? 0;

  return (
    <dialog ref={ref} className="game-detail study-sync-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && close()}>
      <div className="game-detail-content stack">
        <p className="move-actions-title">
          <strong>{t('Pousser sur Lichess', 'Push to Lichess')}</strong>
        </p>
        {done ? (
          <>
            <p className="notice success">
              {done.createdStudy ? t('Étude créée. ', 'Study created. ') : ''}
              {[
                done.updated && t(plural(done.updated, 'chapitre mis à jour', 'chapitres mis à jour'), plural(done.updated, 'chapter updated', 'chapters updated')),
                done.created && t(plural(done.created, 'chapitre ajouté', 'chapitres ajoutés'), plural(done.created, 'chapter added', 'chapters added')),
              ]
                .filter(Boolean)
                .join(', ')}
              .
            </p>
            <div className="row move-actions-footer">
              <Button onClick={() => window.open(`https://lichess.org/study/${done.studyId}`, '_blank', 'noopener')}>{t('Voir sur Lichess', 'See on Lichess')}</Button>
              <Button variant="primary" onClick={close}>{t('Fermer', 'Close')}</Button>
            </div>
          </>
        ) : plan.isLoading ? (
          <p className="muted">{t('Lecture de l’étude sur Lichess…', 'Reading the study on Lichess…')}</p>
        ) : (
          <>
            {p && (
              <>
                <p className="muted small-text">
                  {p.studyId ? (
                    <>
                      {t('Vers l’étude', 'To the study')} <a href={`https://lichess.org/study/${p.studyId}`} target="_blank" rel="noreferrer">{p.studyName ?? p.studyId}</a>
                    </>
                  ) : (
                    t(`Une nouvelle étude « ${repertoire.name} » sera créée sur votre compte Lichess.`, `A new study “${repertoire.name}” will be created on your Lichess account.`)
                  )}
                </p>
                <ul className="sync-list">
                  {p.chapters.map((c) => (
                    <li key={c.chapterId}>
                      <span className="sync-name">{c.name}</span>{' '}
                      <span className={`muted small-text ${c.lost ? 'sync-loss' : ''}`}>
                        {[
                          c.action === 'update' ? t('remplace son chapitre', 'replaces its chapter') : t('nouveau chapitre', 'new chapter'),
                          plural(c.moves, t('coup', 'move'), t('coups', 'moves')),
                          c.lost > 0 && t(`${plural(c.lost, 'coup', 'coups')} seulement sur Lichess, perdus`, `${plural(c.lost, 'move', 'moves')} only on Lichess, lost`),
                          c.lichessName && t(`s’appelle « ${c.lichessName} » sur Lichess (à renommer là-bas)`, `named “${c.lichessName}” on Lichess (rename it there)`),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
                {p.untouched.length > 0 && (
                  <p className="muted small-text">
                    {t(`Laissés tels quels sur Lichess : ${p.untouched.join(', ')}.`, `Left as they are on Lichess: ${p.untouched.join(', ')}.`)}
                  </p>
                )}
                {lost > 0 && (
                  <p className="notice small-text">
                    {t(
                      'Des coups ont été ajoutés sur Lichess depuis : « Mettre à jour depuis Lichess » d’abord pour les garder.',
                      'Moves were added on Lichess since: “Update from Lichess” first to keep them.',
                    )}
                  </p>
                )}
                {p.tooMany && <p className="error small-text">{t('Une étude Lichess a 64 chapitres au plus.', 'A Lichess study has 64 chapters at most.')}</p>}
                {!p.studyId && (
                  <label className="form-row small-text">
                    {t('Visibilité de l’étude', 'Visibility of the study')}
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                      <option value="private">{t('Privée', 'Private')}</option>
                      <option value="unlisted">{t('Non répertoriée (avec le lien)', 'Unlisted (with the link)')}</option>
                      <option value="public">{t('Publique', 'Public')}</option>
                    </select>
                  </label>
                )}
              </>
            )}
            {error && <p className="error small-text">{error.message}</p>}
            <div className="row move-actions-footer">
              <Button variant="ghost" onClick={close}>{t('Annuler', 'Cancel')}</Button>
              {relink ? (
                <Button variant="primary" onClick={() => void import('../local/lichessLogin').then((m) => m.startLichessLogin())}>
                  {t('Autoriser sur Lichess', 'Allow on Lichess')}
                </Button>
              ) : (
                <Button variant="primary" disabled={!p || p.tooMany || push.isPending} onClick={() => push.mutate()}>
                  {push.isPending ? t('Envoi…', 'Pushing…') : t('Pousser', 'Push')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
