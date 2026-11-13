import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type InboxItem, type Me } from '../api';
import { lineText, moveText } from '../chessText';
import { GameSyncInline } from '../components/GameSync';
import { dayStart, explorerParams, useSettings } from '../settings';
import { Button, plural } from '../ui';

const DAY = 86_400_000;
const KIND = { novelty: 'Nouveauté adverse', deviation: 'Vous avez dévié', end: 'Après la fin de votre ligne' } as const;
const fr = (n: number, digits = 1) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits });

/** "What do I do today": training, what the last games show, preparation depth, streak. */
export function Home({ me }: { me: Me }) {
  const settings = useSettings();
  const ex = explorerParams(me, settings.speed, settings.range);
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const summary = useQuery({
    queryKey: ['training-summary', settings.newPerDay],
    queryFn: () => api.trainingSummary(dayStart(), settings.newPerDay),
  });
  const games = useQuery({
    queryKey: ['games-report', settings.gamesDays, settings.gamesSpeeds],
    queryFn: () => api.gamesReport(settings.gamesDays, settings.gamesSpeeds),
  });
  const gaps = useQuery({
    queryKey: ['gaps', ex.speeds, ex.ratings, settings.gapCutoff],
    queryFn: () => api.gaps(ex.speeds, ex.ratings, settings.gapCutoff),
    enabled: (reps.data?.length ?? 0) > 0,
  });
  const history = useQuery({ queryKey: ['stats-history'], queryFn: () => api.statsHistory(90) });

  if (reps.isLoading) return <p className="muted">Chargement…</p>;
  const names = new Map((reps.data ?? []).map((r) => [r.id, r]));

  if (!reps.data?.length) {
    return (
      <div className="narrow-page stack">
        <h2>Bienvenue {me.username} 👋</h2>
        <div className="card">
          <h3>Commencez par un répertoire</h3>
          <p className="muted">
            Un répertoire rassemble vos coups pour une couleur. Créez-en un, importez un PGN ou jouez les coups sur l’échiquier, puis
            entraînez-vous : l’application vous les fait réviser au bon moment.
          </p>
          <Button variant="primary" to="/repertoires">Créer un répertoire</Button>
        </div>
      </div>
    );
  }

  const due = summary.data?.reduce((n, s) => n + s.due, 0) ?? 0;
  const fresh = summary.data?.reduce((n, s) => n + s.new, 0) ?? 0;
  const items = games.data
    ? [...games.data.inbox.novelties, ...games.data.inbox.deviations, ...games.data.inbox.ends].sort((a, b) => b.games - a.games).slice(0, 3)
    : [];

  // Streak: consecutive days with answers, ending today or yesterday.
  const days = new Set((history.data ?? []).map((r) => dayStart(new Date(r.reviewedAt))));
  const today = dayStart();
  let streak = 0;
  for (let d = days.has(today) ? today : today - DAY; days.has(d); d -= DAY) streak++;
  const week = (history.data ?? []).filter((r) => Date.parse(r.reviewedAt) >= today - 6 * DAY).length;

  return (
    <div className="stack home">
      <h2>Bonjour {me.username}</h2>

      <section className="card hero">
        <div className="text">
          <div className="muted small-text" style={{ margin: 0 }}>Entraînement du jour</div>
          {due + fresh > 0 ? (
            <div className="big-number">
              {due}
              <span className="tile-unit"> à revoir · {plural(fresh, 'nouvelle', 'nouvelles')}</span>
            </div>
          ) : (
            <div className="big-number">✓ <span className="tile-unit">tout est à jour</span></div>
          )}
        </div>
        <Button variant={due + fresh > 0 ? 'primary' : 'secondary'} size="lg" icon="play" to="/train">
          {due + fresh > 0 ? 'S’entraîner' : 'Jouer les lignes'}
        </Button>
      </section>

      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <h3>Vos parties</h3>
            <Link to="/bilan/parties" className="small-text" style={{ margin: 0 }}>Tout voir</Link>
          </div>
          {games.data && games.data.games > 0 ? (
            <>
              <p className="muted small-text">
                {plural(games.data.games, 'partie analysée', 'parties analysées')}. Les plus fréquents :
              </p>
              {items.map((item) => (
                <HomeInboxItem key={item.key} item={item} repName={names.get(item.repertoireId)?.name} />
              ))}
              {items.length === 0 && <p className="muted">Rien à signaler : vos parties suivent votre préparation.</p>}
              {games.data.outside[0] && (
                <p className="muted small-text">
                  Hors de vos répertoires : {games.data.outside[0].move} ({plural(games.data.outside[0].games, 'partie', 'parties')})
                </p>
              )}
            </>
          ) : (
            <p className="muted">Vos parties montreront où l’adversaire sort de votre préparation et où vous vous trompez.</p>
          )}
          <GameSyncInline />
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Préparation</h3>
            <Link to="/bilan/trous" className="small-text" style={{ margin: 0 }}>Les trous</Link>
          </div>
          <p className="muted small-text">Nombre moyen de coups qu’une partie reste dans vos lignes.</p>
          {(['white', 'black'] as const).map((c) => {
            const r = gaps.data?.[c];
            if (!r) return null;
            return (
              <div key={c} className="home-item">
                <span className={`dot ${c}`} style={{ marginTop: 4 }} />
                <div className="what">
                  <strong>{c === 'white' ? 'Blancs' : 'Noirs'}</strong>
                  <div className="line">{plural(r.gaps.length, 'trou', 'trous')} de {fr(100 * settings.gapCutoff)} % ou plus</div>
                </div>
                <div className="big-number" style={{ fontSize: '1.5rem' }}>
                  {r.unknown >= 0.01 ? '≥ ' : ''}{fr(r.depth)}
                  <span className="tile-unit"> coups</span>
                </div>
              </div>
            );
          })}
          {gaps.isLoading && <p className="muted">Calcul…</p>}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Régularité</h3>
            <Link to="/bilan/progres" className="small-text" style={{ margin: 0 }}>Progrès</Link>
          </div>
          <div className="row" style={{ gap: 24 }}>
            <div>
              <div className="big-number">{streak}</div>
              <div className="muted small-text">{streak > 1 ? 'jours de suite' : 'jour de suite'}</div>
            </div>
            <div>
              <div className="big-number">{week}</div>
              <div className="muted small-text">réponses cette semaine</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function HomeInboxItem({ item, repName }: { item: InboxItem; repName?: string }) {
  const line = item.line.sans;
  return (
    <Link to="/bilan/parties" className="home-item" style={{ color: 'inherit', textDecoration: 'none' }}>
      <div className="what">
        <div>
          <strong>{KIND[item.kind]}</strong> <span className="muted">· {repName} · {plural(item.games, 'partie', 'parties')}</span>
        </div>
        <div className="line">
          {lineText(line)} <span className="hole-move">{moveText(line, item.move.san)}</span>
          {item.kind === 'deviation' && <> au lieu de {item.expected.join(' ou ')}</>}
        </div>
      </div>
    </Link>
  );
}
