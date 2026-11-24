import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Me } from '../api';
import { GameSyncRows, useGameSync } from '../components/GameSync';
import { t, translateError } from '../i18n';
import { Button, PageHeader } from '../ui';
import { useScrollToHash } from './Settings';

/** Mon compte: the accounts linked on Lichess and Chess.com (kept on this device), game sync. */
export function Account({ me }: { me: Me }) {
  const qc = useQueryClient();
  const sync = useGameSync();
  const [chesscom, setChesscom] = useState(me.chesscom?.username ?? '');
  const [message, setMessage] = useState<string | null>(null);
  useScrollToHash();

  const onSaved = ({ user, warning }: { user: Me; warning?: string }) => {
    qc.setQueryData(['me'], user);
    void qc.invalidateQueries({ queryKey: ['game-sync'] });
    setMessage(warning ? translateError(warning) : t('Enregistré.', 'Saved.'));
  };
  const saveChesscom = useMutation({
    mutationFn: (name: string | null) => api.updateMe({ chesscomUsername: name }),
    onSuccess: onSaved,
  });
  const unlink = useMutation({ mutationFn: api.unlinkLichess, onSuccess: onSaved });
  const error = saveChesscom.error ?? unlink.error ?? sync.start.error;

  return (
    <div className="narrow-page stack">
      <PageHeader
        title={t('Mon compte', 'My account')}
        subtitle={t(<>Réglages de l’application : <Link to="/settings">Paramètres</Link></>, <>App settings: <Link to="/settings">Settings</Link></>)}
      />
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error.message}</p>}

      <section className="card" id="accounts">
        <h3>{t('Comptes liés', 'Linked accounts')}</h3>
        <div className="setting">
          <div className="what">
            <strong>Lichess</strong>
            <div className="hint">
              {me.lichess
                ? <>{t('Lié à', 'Linked to')} <strong>{me.lichess.username}</strong>{me.lichess.perfs && <> · blitz {me.lichess.perfs.blitz?.rating ?? '–'} · {t('rapide', 'rapid')} {me.lichess.perfs.rapid?.rating ?? '–'}</>}</>
                : t('Votre classement Lichess, des statistiques à jour et vos parties Lichess.', 'Your Lichess rating, up-to-date statistics and your Lichess games.')}
            </div>
          </div>
          {me.lichess ? (
            <Button size="sm" variant="danger" onClick={() => confirm(t('Délier votre compte Lichess ?', 'Unlink your Lichess account?')) && unlink.mutate()}>
              {t('Délier', 'Unlink')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void import('../local/lichessLogin').then((m) => m.startLichessLogin())}>
              {t('Lier Lichess', 'Link Lichess')}
            </Button>
          )}
        </div>
        <div className="setting">
          <div className="what">
            <strong>Chess.com</strong>
            <div className="hint">
              {t('Votre pseudo (données publiques, aucun mot de passe).', 'Your username (public data, no password).')}
              {me.chesscom?.ratings && <> {t('Classements : rapide', 'Ratings: rapid')} {me.chesscom.ratings.rapid ?? '–'} · blitz {me.chesscom.ratings.blitz ?? '–'} · bullet {me.chesscom.ratings.bullet ?? '–'}</>}
            </div>
          </div>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              saveChesscom.mutate(chesscom.trim() || null);
            }}
          >
            <input placeholder={t('Pseudo Chess.com', 'Chess.com username')} value={chesscom} onChange={(e) => setChesscom(e.target.value)} />
            <Button size="sm" type="submit" disabled={saveChesscom.isPending}>{t('Enregistrer', 'Save')}</Button>
          </form>
        </div>
        {sync.state && (
          <>
            <h4 className="section-title">{t('Synchronisation', 'Sync')}</h4>
            <GameSyncRows state={sync.state} onSync={(s) => sync.start.mutate(s)} />
          </>
        )}
      </section>
    </div>
  );
}
