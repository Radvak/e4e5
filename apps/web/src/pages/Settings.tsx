import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Me } from '../api';
import { RatingRange } from '../components/RatingRange';
import { explorerParams, NO_LIMIT, SPEED_CHOICES, SPEED_NAMES, useSettings, type LearnOrder, type SpeedChoice } from '../settings';
import { PageHeader } from '../ui';

const PERIODS = [
  { days: 30, label: '30 derniers jours' },
  { days: 90, label: '3 derniers mois' },
  { days: 365, label: '12 derniers mois' },
  { days: 0, label: 'Toutes les parties' },
];
const GAME_SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];
const CUTOFFS = [0.005, 0.01, 0.02, 0.05];
const pct = (x: number) => `${(100 * x).toLocaleString('fr-FR')} %`;

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
        <KeepShareSetting />
        <div className="setting">
          <div className="what">
            <strong>Temps pour répondre</strong>
            <div className="hint">En révision, pour un coup déjà appris. Temps écoulé : compté comme une erreur, la réponse est montrée.</div>
          </div>
          <select value={settings.answerSeconds} onChange={(e) => settings.setAnswerSeconds(Number(e.target.value))}>
            {[5, 10, 15, 20, 30, 0].map((n) => (
              <option key={n} value={n}>{n === 0 ? 'Sans limite' : `${n} s`}</option>
            ))}
          </select>
        </div>
        <div className="setting">
          <div className="what">
            <strong>Coups manquants</strong>
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

/**
 * Shortened lines: % of each repertoire's positions trained, the most likely at my level first.
 * Saved after a pause while dragging (each value recomputes the training counts).
 */
function KeepShareSetting() {
  const { keepShare, setKeepShare } = useSettings();
  const [value, setValue] = useState(keepShare);
  useEffect(() => {
    if (value === keepShare) return;
    const t = setTimeout(() => setKeepShare(value), 400);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="setting">
      <div className="what">
        <strong>Longueur des lignes</strong>
        <div className="hint">
          {value === 100
            ? 'Toutes les positions de vos répertoires sont entraînées.'
            : `Seules les ${value} % de positions les plus probables à votre niveau (statistiques Lichess) sont entraînées, dans chaque répertoire.`}
        </div>
      </div>
      <label className="range-setting">
        <input type="range" min={1} max={100} value={value} onChange={(e) => setValue(Number(e.target.value))} aria-label="Part des positions entraînées" />
        <span>{value === 100 ? '100 % (lignes entières)' : `${value} %`}</span>
      </label>
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
