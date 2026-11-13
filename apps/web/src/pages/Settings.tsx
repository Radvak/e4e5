import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, type Me } from '../api';
import { GameSyncRows, useGameSync } from '../components/GameSync';
import { RatingRange } from '../components/RatingRange';
import { explorerParams, SPEED_CHOICES, SPEED_NAMES, useSettings, type SpeedChoice } from '../settings';
import { Button, PageHeader } from '../ui';

const PERIODS = [
  { days: 30, label: '30 derniers jours' },
  { days: 90, label: '3 derniers mois' },
  { days: 365, label: '12 derniers mois' },
  { days: 0, label: 'Toutes les parties' },
];
const GAME_SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];
const CUTOFFS = [0.005, 0.01, 0.02, 0.05];
const pct = (x: number) => `${(100 * x).toLocaleString('fr-FR')} %`;

export function Settings({ me }: { me: Me }) {
  const qc = useQueryClient();
  const settings = useSettings();
  const ex = explorerParams(me, settings.speed, settings.range);
  const sync = useGameSync();
  const { hash } = useLocation();
  const [chesscom, setChesscom] = useState(me.chesscom?.username ?? '');
  const [password, setPassword] = useState('');
  const [login, setLogin] = useState(me.lichess?.username.toLowerCase() ?? '');
  const [message, setMessage] = useState<string | null>(null);

  // /settings#statistiques: open on that section.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

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

  const toggleSpeed = (s: string) =>
    settings.setGamesSpeeds(settings.gamesSpeeds.includes(s) ? settings.gamesSpeeds.filter((x) => x !== s) : [...settings.gamesSpeeds, s]);

  return (
    <div className="narrow-page stack">
      <PageHeader title="Paramètres" />
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

      <section className="card" id="parties">
        <h3>Comptes et parties</h3>
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
        <h4 className="section-title">Parties analysées</h4>
        <div className="setting">
          <div className="what">
            <strong>Période</strong>
            <div className="hint">Les parties prises en compte dans l’accueil et le bilan.</div>
          </div>
          <select value={settings.gamesDays} onChange={(e) => settings.setGamesDays(Number(e.target.value))}>
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="setting">
          <div className="what"><strong>Cadences</strong></div>
          <div className="row">
            {GAME_SPEEDS.map((s) => (
              <label key={s} className="check">
                <input type="checkbox" checked={settings.gamesSpeeds.includes(s)} onChange={() => toggleSpeed(s)} /> {SPEED_NAMES[s]}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="card" id="statistiques">
        <h3>Statistiques d’ouvertures</h3>
        <p className="muted small-text">
          Les coups joués par les joueurs Lichess de votre niveau : flèches, tableaux, trous de préparation, adversaire de l’entraînement.
        </p>
        <div className="setting">
          <div className="what"><strong>Cadence</strong></div>
          <select value={settings.speed} onChange={(e) => settings.setSpeed(e.target.value as SpeedChoice)}>
            {(Object.keys(SPEED_CHOICES) as SpeedChoice[]).map((s) => (
              <option key={s} value={s}>{SPEED_CHOICES[s]}</option>
            ))}
          </select>
        </div>
        <div className="setting">
          <div className="what">
            <strong>Niveau des joueurs</strong>
            <div className="hint">
              {ex.source
                ? `Automatique : autour de votre classement ${ex.source} (${ex.rating}).`
                : 'Automatique : autour de 1500 (aucun classement connu).'}{' '}
              Les classements Chess.com sont en général plus bas que ceux de Lichess à force égale : ajustez la tranche à vos adversaires.
            </div>
          </div>
          <div style={{ minWidth: 240, flex: 1 }}>
            <RatingRange current={ex.ratings} />
          </div>
        </div>
      </section>

      <section className="card" id="entrainement">
        <h3>Entraînement et préparation</h3>
        <div className="setting">
          <div className="what">
            <strong>Nouvelles positions par jour</strong>
            <div className="hint">Par répertoire.</div>
          </div>
          <select value={settings.newPerDay} onChange={(e) => settings.setNewPerDay(Number(e.target.value))}>
            {[0, 5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="setting">
          <div className="what">
            <strong>Trous affichés</strong>
            <div className="hint">Coups adverses non préparés joués dans au moins cette part des parties.</div>
          </div>
          <select value={settings.gapCutoff} onChange={(e) => settings.setGapCutoff(Number(e.target.value))}>
            {CUTOFFS.map((c) => (
              <option key={c} value={c}>{pct(c)}</option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}
