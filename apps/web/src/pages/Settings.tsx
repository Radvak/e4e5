import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { gapCutoffFor, LINE_DEPTHS } from '@tabiya/core';
import { serverApi, type Me, type TrainingSummary } from '../api';
import { isLocalMode, setLocalMode } from '../local/mode';
import { RatingRange } from '../components/RatingRange';
import { depthPct, explorerParams, NO_LIMIT, SPEED_CHOICES, SPEED_NAMES, useSettings, type LearnOrder, type SpeedChoice } from '../settings';
import { PageHeader, plural } from '../ui';
import { useTrainingSummary } from '../useTrainingSummary';

const PERIODS = [
  { days: 30, label: '30 derniers jours' },
  { days: 90, label: '3 derniers mois' },
  { days: 365, label: '12 derniers mois' },
  { days: 0, label: 'Toutes les parties' },
];
const GAME_SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];

/** Paramètres: the app's settings (games analysed, statistics, training, board). Accounts: Account page. */
export function Settings({ me }: { me: Me }) {
  const settings = useSettings();
  const ex = explorerParams(me, settings.speed, settings.range);
  useScrollToHash();

  const toggleSpeed = (s: string) =>
    settings.setGamesSpeeds(settings.gamesSpeeds.includes(s) ? settings.gamesSpeeds.filter((x) => x !== s) : [...settings.gamesSpeeds, s]);

  return (
    <div className="narrow-page stack">
      <PageHeader title="Paramètres" subtitle={<>Comptes Lichess et Chess.com, mot de passe : <Link to="/compte">Mon compte</Link></>} />

      <section className="card" id="parties">
        <h3>Parties analysées</h3>
        <div className="setting">
          <div className="what">
            <strong>Période</strong>
            <div className="hint">Les parties prises en compte dans Mes parties et les Lacunes.</div>
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
          Les coups joués par les joueurs Lichess de votre niveau : flèches, tableaux, coups manquants, adversaire de l’entraînement.
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

      <section className="card" id="echiquier">
        <h3>Échiquier</h3>
        <div className="setting">
          <div className="what">
            <strong>Sons des coups</strong>
            <div className="hint">Un son à chaque coup joué et à chaque prise (sons de Lichess).</div>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.sound} onChange={(e) => settings.setSound(e.target.checked)} /> Activés
          </label>
        </div>
        <div className="setting">
          <div className="what">
            <strong>Vibration sur erreur</strong>
            <div className="hint">Sur téléphone, le coup qui n’est pas dans votre répertoire fait vibrer.</div>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.haptics} onChange={(e) => settings.setHaptics(e.target.checked)} /> Activée
          </label>
        </div>
      </section>

      <section className="card" id="entrainement">
        <h3>Entraînement et préparation</h3>
        <div className="setting">
          <div className="what">
            <strong>Nouvelles lignes par jour</strong>
            <div className="hint">Pour tous les répertoires actifs ensemble. Chaque ligne est apprise en entier ; les lignes à revoir ne sont jamais limitées.</div>
          </div>
          <select value={settings.newPerDay} onChange={(e) => settings.setNewPerDay(Number(e.target.value))}>
            {[1, 3, 5, 10, 20, NO_LIMIT].map((n) => (
              <option key={n} value={n}>{n === NO_LIMIT ? 'Sans limite' : n}</option>
            ))}
          </select>
        </div>
        <div className="setting">
          <div className="what">
            <strong>Ordre des nouvelles lignes</strong>
            <div className="hint">
              {settings.learnOrder === 'frequency'
                ? 'D’abord ce que vos adversaires jouent le plus à votre niveau (statistiques Lichess).'
                : 'L’ordre du répertoire : ligne principale d’abord, puis les variantes (utile pour un cours pensé dans un ordre précis).'}
            </div>
          </div>
          <select value={settings.learnOrder} onChange={(e) => settings.setLearnOrder(e.target.value as LearnOrder)}>
            <option value="frequency">Les plus jouées à mon niveau</option>
            <option value="repertoire">Ordre du répertoire</option>
          </select>
        </div>
        <LineDepthSetting me={me} />
        <div className="setting">
          <div className="what">
            <strong>Temps pour répondre</strong>
            <div className="hint">En mode « Se tester », pour chaque coup à jouer (pas en révision). Temps écoulé : compté comme une erreur, la réponse est montrée.</div>
          </div>
          <select value={settings.answerSeconds} onChange={(e) => settings.setAnswerSeconds(Number(e.target.value))}>
            {[5, 10, 15, 20, 30, 0].map((n) => (
              <option key={n} value={n}>{n === 0 ? 'Sans limite' : `${n} s`}</option>
            ))}
          </select>
        </div>
      </section>

      <LocalModeSetting />
    </div>
  );
}

/**
 * Local mode (experimental): the repertoires kept in SQLite on this device instead of the
 * server, a step of the migration without a server (MIGRATION-SERVERLESS.md).
 */
function LocalModeSetting() {
  const [state, setState] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const local = isLocalMode();
  const copy = async () => {
    if (!confirm('Remplacer les répertoires de cet appareil par une copie de ceux du serveur ?')) return;
    setState('Copie en cours…');
    try {
      const { copyFromServer } = await import('../local/backend');
      const n = await copyFromServer(serverApi);
      setState(`${plural(n.repertoires, 'répertoire copié', 'répertoires copiés')}, ${plural(n.moves, 'coup', 'coups')}.`);
      await queryClient.invalidateQueries();
    } catch (e) {
      setState(`Échec : ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <section className="card" id="local">
      <h3>Mode local (expérimental)</h3>
      <div className="setting">
        <div className="what">
          <strong>Répertoires sur cet appareil</strong>
          <div className="hint">
            Les répertoires sont lus et enregistrés dans le navigateur, sans le serveur. Le reste (entraînement, statistiques, parties) passe
            encore par le serveur. Un seul onglet à la fois.
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={local} onChange={(e) => setLocalMode(e.target.checked)} /> Activé
        </label>
      </div>
      {local && (
        <div className="setting">
          <div className="what">
            <strong>Copier depuis le serveur</strong>
            <div className="hint">Remplace les répertoires de cet appareil par ceux du serveur (mêmes identifiants).</div>
            {state && <div className="hint">{state}</div>}
          </div>
          <button onClick={copy}>Copier</button>
        </div>
      )}
    </section>
  );
}

/**
 * Depth of the lines: positions trained (and holes listed) from a share of the games at my level.
 * Each choice shows the positions it trains in the active repertoires, more telling than the share.
 */
function LineDepthSetting({ me }: { me: Me }) {
  const { lineDepth, setLineDepth } = useSettings();
  const summary = useTrainingSummary(me);
  const active = (summary.data ?? []).filter((s) => s.active);
  const sum = (f: (s: TrainingSummary) => number | undefined) => (summary.data ? active.reduce((n, s) => n + (f(s) ?? 0), 0) : undefined);
  const withStats = active.every((s) => s.byDepth);
  const choices = [
    ...LINE_DEPTHS.map((d) => ({ depth: d as number, positions: withStats ? sum((s) => s.byDepth?.[String(d)]) : undefined, label: `au moins ${depthPct(d)} des parties` })),
    { depth: 0, positions: sum((s) => s.positions), label: 'lignes entières' },
  ];
  return (
    <div className="setting setting-block">
      <div className="what">
        <strong>Profondeur des lignes</strong>
        <div className="hint">
          Une position est entraînée si on la rencontre dans au moins cette part des parties à votre niveau (statistiques Lichess).
          Les coups manquants sont signalés à partir du même seuil{lineDepth === 0 ? ` (${depthPct(gapCutoffFor(0))} avec les lignes entières)` : ''}.
          Positions de vos répertoires en entraînement.
        </div>
      </div>
      <div className="depth-choices" role="radiogroup" aria-label="Profondeur des lignes">
        {choices.map((c) => (
          <label key={c.depth} className={`depth-choice ${lineDepth === c.depth ? 'on' : ''}`}>
            <input type="radio" name="line-depth" checked={lineDepth === c.depth} onChange={() => setLineDepth(c.depth)} />
            <strong>{c.positions === undefined ? '…' : plural(c.positions, 'position', 'positions')}</strong>
            <span className="muted">{c.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** /settings#statistiques, /compte#comptes: open on that section. */
export function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);
}
