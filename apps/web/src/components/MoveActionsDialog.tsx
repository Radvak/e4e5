/**
 * The actions on a repertoire move, asked by a long press on it (right click with a mouse): pause
 * it (or train it again) at once, or delete it after a confirmation (the move and what only
 * follows it).
 */
import { useEffect, useRef, useState } from 'react';
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
  /** Where it is deleted from, e.g. "de ce répertoire". */
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
                {paused ? 'Reprendre l’entraînement' : 'Mettre en pause'}
                <span className="muted small-text">{paused ? 'ce coup et sa suite seront entraînés' : 'ce coup et sa suite ne sont plus entraînés'}</span>
              </button>
              <button type="button" className="move-action danger" onClick={() => setConfirming(true)}>
                <Icon name="close" size={18} />
                Supprimer…
              </button>
            </div>
            <div className="row move-actions-footer">
              <Button variant="ghost" onClick={close}>Annuler</Button>
            </div>
          </>
        ) : (
          <>
            <p className="move-actions-title">
              Supprimer <strong><San san={san} nags={nags} /></strong> {where} ?
            </p>
            <p className="muted small-text">Ce coup et la suite de la ligne qui ne passe que par lui seront supprimés.</p>
            <div className="row move-actions-footer">
              <Button variant="ghost" onClick={() => setConfirming(false)}>Retour</Button>
              <Button
                variant="danger"
                onClick={() => {
                  onDelete();
                  close();
                }}
              >
                Supprimer
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
