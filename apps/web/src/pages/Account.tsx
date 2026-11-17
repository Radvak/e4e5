import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Me } from '../api';
import { GameSyncRows, useGameSync } from '../components/GameSync';
import { Button, PageHeader } from '../ui';
import { useScrollToHash } from './Settings';

/** Mon compte: login and password, accounts linked on Lichess and Chess.com, game sync. */
export function Account({ me }: { me: Me }) {
  const qc = useQueryClient();
  const sync = useGameSync();
  const [chesscom, setChesscom] = useState(me.chesscom?.username ?? '');
  const [password, setPassword] = useState('');
  const [login, setLogin] = useState(me.lichess?.username.toLowerCase() ?? '');
  const [message, setMessage] = useState<string | null>(null);
  useScrollToHash();

  const onSaved = ({ user, warning }: { user: Me; warning?: string }) => {
    qc.setQueryData(['me'], user);
    void qc.invalidateQueries({ queryKey: ['game-sync'] });
    setMessage(warning ?? 'Enregistré.');
  };
  const saveChesscom = useMutation({
    mutationFn: (name: string | null) => api.updateMe({ chesscomUsername: name }),
    onSuccess: onSaved,
  });
  const savePassword = useMutation({
    mutationFn: () => api.updateMe(me.login ? { password } : { password, login }),
    onSuccess: (r) => {
      setPassword('');
      onSaved(r);
    },
  });
  const unlink = useMutation({ mutationFn: api.unlinkLichess, onSuccess: onSaved });
  const error = saveChesscom.error ?? savePassword.error ?? unlink.error ?? sync.start.error;

  return (
    <div className="narrow-page stack">
      <PageHeader title="Mon compte" subtitle={<>Réglages de l’application : <Link to="/settings">Paramètres</Link></>} />
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error.message}</p>}

      <section className="card" id="compte">
        <h3>Compte</h3>
        <p>
          <strong>{me.username}</strong>
          {me.guest && <span className="muted"> · invité (sans mot de passe, pour tester)</span>}
          {me.login && !me.guest && <span className="muted"> · identifiant « {me.login} »</span>}
        </p>
        {!me.guest && (
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              savePassword.mutate();
            }}
          >
            {!me.login && (
              <input autoComplete="username" placeholder="Identifiant" value={login} onChange={(e) => setLogin(e.target.value)} aria-label="Identifiant" />
            )}
            <input
              type="password"
              autoComplete="new-password"
              placeholder={me.hasPassword ? 'Nouveau mot de passe' : 'Mot de passe (8 caractères min.)'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" disabled={password.length < 8 || (!me.login && login.length < 2) || savePassword.isPending}>
              {me.hasPassword ? 'Changer le mot de passe' : 'Ajouter un mot de passe'}
            </Button>
          </form>
        )}
        {!me.guest && !me.hasPassword && (
          <p className="muted small-text">Un identifiant et un mot de passe permettent aussi de se connecter sans Lichess (par exemple sur un réseau où Lichess est bloqué).</p>
        )}
      </section>

      <section className="card" id="comptes">
        <h3>Comptes liés</h3>
        <div className="setting">
          <div className="what">
            <strong>Lichess</strong>
            <div className="hint">
              {me.lichess
                ? <>Lié à <strong>{me.lichess.username}</strong>{me.lichess.perfs && <> · blitz {me.lichess.perfs.blitz?.rating ?? '–'} · rapide {me.lichess.perfs.rapid?.rating ?? '–'}</>}</>
                : 'Votre classement Lichess, des statistiques à jour et vos parties Lichess.'}
            </div>
          </div>
          {me.lichess ? (
            me.hasPassword && (
              <Button size="sm" variant="danger" onClick={() => confirm('Délier votre compte Lichess ?') && unlink.mutate()}>
                Délier
              </Button>
            )
          ) : (
            <Button size="sm" href="/api/auth/login">Lier Lichess</Button>
          )}
        </div>
        <div className="setting">
          <div className="what">
            <strong>Chess.com</strong>
            <div className="hint">
              Votre pseudo (données publiques, aucun mot de passe).
              {me.chesscom?.ratings && <> Classements : rapide {me.chesscom.ratings.rapid ?? '–'} · blitz {me.chesscom.ratings.blitz ?? '–'} · bullet {me.chesscom.ratings.bullet ?? '–'}</>}
            </div>
          </div>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              saveChesscom.mutate(chesscom.trim() || null);
            }}
          >
            <input placeholder="Pseudo Chess.com" value={chesscom} onChange={(e) => setChesscom(e.target.value)} />
            <Button size="sm" type="submit" disabled={saveChesscom.isPending}>Enregistrer</Button>
          </form>
        </div>
        {sync.state && (
          <>
            <h4 className="section-title">Synchronisation</h4>
            <GameSyncRows state={sync.state} onSync={(s) => sync.start.mutate(s)} />
          </>
        )}
      </section>
    </div>
  );
}
