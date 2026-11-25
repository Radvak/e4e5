/**
 * Update a repertoire from its Lichess study (Lichess → app), or link it to a study first: what
 * each chapter would gain and lose, the chapters added or deleted on Lichess, then the chosen
 * changes applied. The training progress stays (the cards belong to the positions).
 */
import { lichessStudyRef, type Color } from '@e4e5/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type LichessStudy, type StudySyncPlan, type StudySyncResult } from '../api';
import { t } from '../i18n';
import { Button, plural } from '../ui';

export function StudySyncDialog({
  repertoire,
  onClose,
}: {
  repertoire: { id: string; name: string; color: Color; lichessStudyId: string | null };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const close = () => ref.current?.close();
  const [studyId, setStudyId] = useState(repertoire.lichessStudyId);
  const [link, setLink] = useState('');
  const [hard, setHard] = useState(false);
  const [result, setResult] = useState<StudySyncResult | null>(null);

  return (
    <dialog ref={ref} className="game-detail study-sync-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && close()}>
      <div className="game-detail-content stack">
        <p className="move-actions-title">
          <strong>{repertoire.lichessStudyId ? t('Mettre à jour depuis Lichess', 'Update from Lichess') : t('Lier à une étude Lichess', 'Link to a Lichess study')}</strong>
        </p>
        {result ? (
          <Done result={result} onClose={close} />
        ) : !studyId ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const found = lichessStudyRef(link.trim());
              if (found) setStudyId(found.studyId);
            }}
          >
            <p className="muted small-text">
              {t(
                'Les chapitres de l’étude sont associés à ceux du répertoire par leur nom ; les autres peuvent être ajoutés.',
                'The chapters of the study are matched to those of the repertoire by their name; the others can be added.',
              )}
            </p>
            <input autoFocus placeholder={t('Lien de l’étude Lichess', 'Link of the Lichess study')} value={link} onChange={(e) => setLink(e.target.value)} />
            {link.trim() && !lichessStudyRef(link.trim()) && <p className="error small-text">{t('Ce n’est pas un lien d’étude Lichess.', 'This is not a Lichess study link.')}</p>}
            <div className="row move-actions-footer">
              <Button variant="ghost" onClick={close}>{t('Annuler', 'Cancel')}</Button>
              <Button type="submit" variant="primary" disabled={!lichessStudyRef(link.trim())}>{t('Continuer', 'Continue')}</Button>
            </div>
          </form>
        ) : (
          <Plan repertoire={repertoire} studyId={studyId} hard={hard} setHard={setHard} onDone={setResult} onCancel={close} />
        )}
      </div>
    </dialog>
  );
}

/** Why a new chapter of the study cannot be added (same rules as the import of a study). */
function unusable(study: LichessStudy, lichessChapterId: string, color: Color): string | null {
  const c = study.chapters.find((x) => x.id === lichessChapterId);
  if (!c) return null;
  if (!c.joins) return t('commence à une position qu’aucun autre chapitre n’atteint', 'starts from a position no other chapter reaches');
  if ((c.orientation ?? study.color) !== color) return t('étudié avec l’autre couleur', 'studied with the other colour');
  return null;
}

function Plan({
  repertoire,
  studyId,
  hard,
  setHard,
  onDone,
  onCancel,
}: {
  repertoire: { id: string; color: Color };
  studyId: string;
  hard: boolean;
  setHard: (on: boolean) => void;
  onDone: (r: StudySyncResult) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['study-sync', repertoire.id, studyId, hard],
    queryFn: () => api.studySyncPlan(repertoire.id, studyId, hard),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const plan: StudySyncPlan | undefined = q.data?.plan;
  const study = q.data?.study;
  const changes = (m: StudySyncPlan['matched'][number]) => m.added + m.removed + m.updated > 0 || m.name !== m.lichessName || m.byName;
  // Defaults: the chapters that change, the new chapters that can join; nothing deleted.
  const defaults = useMemo(
    () => ({
      update: new Set(plan?.matched.filter(changes).map((m) => m.chapterId) ?? []),
      add: new Set(study && plan ? plan.fresh.filter((c) => !unusable(study, c.lichessChapterId, repertoire.color)).map((c) => c.lichessChapterId) : []),
      remove: new Set<string>(),
    }),
    [plan, study],
  );
  const [picked, setPicked] = useState(defaults);
  useEffect(() => setPicked(defaults), [defaults]);
  const toggle = (kind: 'update' | 'add' | 'remove', id: string) =>
    setPicked((p) => {
      const next = new Set(p[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...p, [kind]: next };
    });
  const apply = useMutation({
    mutationFn: () => api.applyStudySync(repertoire.id, studyId, { update: [...picked.update], add: [...picked.add], remove: [...picked.remove], hard }),
    onSuccess: (r) => {
      for (const key of ['repertoire', 'repertoires', 'training-summary', 'gaps', 'games-report', 'explorer-reps', 'explorer-pos-reps']) void qc.invalidateQueries({ queryKey: [key] });
      onDone(r);
    },
  });

  if (q.isLoading) return <p className="muted">{t('Lecture de l’étude sur Lichess…', 'Reading the study on Lichess…')}</p>;
  if (q.error || !plan || !study) {
    return (
      <>
        <p className="error small-text">{q.error?.message ?? t('Étude introuvable', 'Study not found')}</p>
        <div className="row move-actions-footer"><Button variant="ghost" onClick={onCancel}>{t('Fermer', 'Close')}</Button></div>
      </>
    );
  }
  const count = picked.update.size + picked.add.size + picked.remove.size;
  const delta = (m: StudySyncPlan['matched'][number]) =>
    [
      m.added && `+${t(plural(m.added, 'coup', 'coups'), plural(m.added, 'move', 'moves'))}`,
      m.removed && `−${t(plural(m.removed, 'coup', 'coups'), plural(m.removed, 'move', 'moves'))}`,
      m.updated && t(`${plural(m.updated, 'coup annoté', 'coups annotés')} autrement`, `${plural(m.updated, 'move', 'moves')} annotated differently`),
      m.name !== m.lichessName && t(`renommé « ${m.lichessName} »`, `renamed “${m.lichessName}”`),
      m.byName && t('lié par son nom', 'linked by its name'),
    ]
      .filter(Boolean)
      .join(' · ') || t('à jour', 'up to date');
  return (
    <>
      <p className="muted small-text">
        <a href={`https://lichess.org/study/${studyId}`} target="_blank" rel="noreferrer">{study.name}</a> ·{' '}
        {t(plural(study.chapters.length, 'chapitre', 'chapitres'), plural(study.chapters.length, 'chapter', 'chapters'))}
      </p>
      {plan.matched.length > 0 && (
        <section>
          <h4 className="chapter-group-title">{t('Chapitres du répertoire', 'Chapters of the repertoire')}</h4>
          <ul className="sync-list">
            {plan.matched.map((m) => (
              <li key={m.chapterId}>
                <label className="check">
                  <input type="checkbox" checked={picked.update.has(m.chapterId)} disabled={!changes(m)} onChange={() => toggle('update', m.chapterId)} />
                  <span className="sync-name">{m.name}</span>
                  <span className={`muted small-text ${m.removed ? 'sync-loss' : ''}`}>{delta(m)}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      {plan.fresh.length > 0 && (
        <section>
          <h4 className="chapter-group-title">{t('Nouveaux sur Lichess', 'New on Lichess')}</h4>
          <ul className="sync-list">
            {plan.fresh.map((c) => {
              const why = unusable(study, c.lichessChapterId, repertoire.color);
              return (
                <li key={c.lichessChapterId}>
                  <label className="check" title={why ?? undefined}>
                    <input type="checkbox" checked={picked.add.has(c.lichessChapterId)} disabled={!!why} onChange={() => toggle('add', c.lichessChapterId)} />
                    <span className="sync-name">{c.name}</span>
                    {why && <span className="muted small-text">{why}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {plan.gone.length > 0 && (
        <section>
          <h4 className="chapter-group-title">{t('Supprimés sur Lichess', 'Deleted on Lichess')}</h4>
          <ul className="sync-list">
            {plan.gone.map((c) => (
              <li key={c.chapterId}>
                <label className="check">
                  <input type="checkbox" checked={picked.remove.has(c.chapterId)} onChange={() => toggle('remove', c.chapterId)} />
                  <span className="sync-name">{c.name}</span>
                  <span className="muted small-text">{t('supprimer aussi ici', 'delete here too')}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <label className="check small-text">
        <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />
        {t('Remplacer exactement par Lichess (les coups ajoutés ici sont supprimés)', 'Replace exactly with Lichess (the moves added here are deleted)')}
      </label>
      <p className="muted small-text">{t('Votre progression d’entraînement est gardée.', 'Your training progress is kept.')}</p>
      {apply.error && <p className="error small-text">{apply.error.message}</p>}
      <div className="row move-actions-footer">
        <Button variant="ghost" onClick={onCancel}>{t('Annuler', 'Cancel')}</Button>
        <Button variant="primary" disabled={!count || apply.isPending} onClick={() => apply.mutate()}>
          {apply.isPending ? t('Mise à jour…', 'Updating…') : t('Mettre à jour', 'Update')}
        </Button>
      </div>
    </>
  );
}

function Done({ result, onClose }: { result: StudySyncResult; onClose: () => void }) {
  const parts = [
    result.added && t(plural(result.added, 'coup ajouté', 'coups ajoutés'), plural(result.added, 'move added', 'moves added')),
    result.removed && t(plural(result.removed, 'coup supprimé', 'coups supprimés'), plural(result.removed, 'move deleted', 'moves deleted')),
    result.updated && t(plural(result.updated, 'coup annoté', 'coups annotés'), plural(result.updated, 'move annotated', 'moves annotated')),
    result.chaptersAdded && t(plural(result.chaptersAdded, 'chapitre ajouté', 'chapitres ajoutés'), plural(result.chaptersAdded, 'chapter added', 'chapters added')),
    result.chaptersRemoved && t(plural(result.chaptersRemoved, 'chapitre supprimé', 'chapitres supprimés'), plural(result.chaptersRemoved, 'chapter deleted', 'chapters deleted')),
  ].filter(Boolean);
  return (
    <>
      <p className="notice success">{parts.length ? parts.join(', ') + '.' : t('Déjà à jour.', 'Already up to date.')}</p>
      <div className="row move-actions-footer">
        <Button variant="primary" onClick={onClose}>{t('Fermer', 'Close')}</Button>
      </div>
    </>
  );
}
