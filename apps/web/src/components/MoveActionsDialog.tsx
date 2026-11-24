/**
 * The actions on a repertoire move, asked by a long press on it (right click with a mouse): pause
 * it (or train it again) at once, or delete it after a confirmation (the move and what only
 * follows it).
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { Button, Icon } from '../ui';
import { San } from './Nag';

export function MoveActionsDialog({
  san,
  nags,
  paused,
  where,
  onPause,
  onDelete,
  onClose,
}: {
  san: string;
  nags?: readonly number[] | null;
  /** The move is paused: the action trains it again. */
  paused: boolean;
  /** Where it is deleted from, e.g. "de ce répertoire" / "from this repertoire". */
  where: string;
  /** Pause (true) or train again (false). */
  onPause: (pause: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const close = () => ref.current?.close();
  // A click on the backdrop closes it, if the press started there too: the click that ends the long
  // press which opened it (the finger lifted where the move was) must not close it at once.
  const downOnBackdrop = useRef(false);
  return (
    <dialog
      ref={ref}
      className="game-detail move-actions-dialog"
      onClose={onClose}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && downOnBackdrop.current) close();
        downOnBackdrop.current = false;
      }}
    >
      <div className="game-detail-content stack">
        {!confirming ? (
          <>
            <p className="move-actions-title">
              <strong><San san={san} nags={nags} /></strong>
            </p>
            <div className="move-actions-list">
              <button
                type="button"
                className="move-action"
                onClick={() => {
                  onPause(!paused);
                  close();
                }}
              >
                <Icon name={paused ? 'play' : 'pause'} size={18} />
                {paused ? t('Reprendre l’entraînement', 'Resume training') : t('Mettre en pause', 'Pause')}
                <span className="muted small-text">{paused ? t('ce coup et sa suite seront entraînés', 'this move and what follows will be trained') : t('ce coup et sa suite ne sont plus entraînés', 'this move and what follows are no longer trained')}</span>
              </button>
              <button type="button" className="move-action danger" onClick={() => setConfirming(true)}>
                <Icon name="close" size={18} />
                {t('Supprimer…', 'Delete…')}
              </button>
            </div>
            <div className="row move-actions-footer">
              <Button variant="ghost" onClick={close}>{t('Annuler', 'Cancel')}</Button>
            </div>
          </>
        ) : (
          <>
            <p className="move-actions-title">
              {t(
                <>Supprimer <strong><San san={san} nags={nags} /></strong> {where} ?</>,
                <>Delete <strong><San san={san} nags={nags} /></strong> {where}?</>,
              )}
            </p>
            <p className="muted small-text">{t('Ce coup et la suite de la ligne qui ne passe que par lui seront supprimés.', 'This move and the rest of the line that only goes through it will be deleted.')}</p>
            <div className="row move-actions-footer">
              <Button variant="ghost" onClick={() => setConfirming(false)}>{t('Retour', 'Back')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  onDelete();
                  close();
                }}
              >
                {t('Supprimer', 'Delete')}
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
