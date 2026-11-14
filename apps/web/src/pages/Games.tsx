import { playSanOn, positionFromFen, type Color } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type GamesReport, type InboxItem, type RepertoireSummary, type Results } from '../api';
import { lineText, moveText } from '../chessText';
import { GameSyncInline, useGameSync } from '../components/GameSync';
import { SPEED_NAMES, useSettings } from '../settings';
import { MiniBoard, type MiniArrow } from '../components/MiniBoard';
import { Button, EmptyState, PageHeader, Tabs, plural } from '../ui';

const PERIOD: Record<number, string> = { 30: '30 derniers jours', 90: '3 derniers mois', 365: '12 derniers mois', 0: 'toutes les parties' };
const pct = (x: number) => `${Math.round(100 * x)} %`;
const score = (r: Results) => {
  const n = r.win + r.draw + r.loss;
  return n ? (r.win + r.draw / 2) / n : 0;
};
const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Bilan › Parties: statistics per repertoire, inbox, recent games. */
const PAGE = 20;
const KIND_HINT = {
  novelties: 'L’adversaire a joué un coup que vous n’avez pas préparé.',
  deviations: 'Vous avez joué autre chose que votre coup préparé.',
  ends: 'La partie a continué après la fin de votre ligne.',
} as const;

/** Mes parties: what the games show (cards with a thumbnail), results per repertoire, recent games. */
export function Games() {
  const { gamesDays, gamesSpeeds } = useSettings();
  const [tab, setTab] = useState<'novelties' | 'deviations' | 'ends'>('novelties');
  const [shown, setShown] = useState(PAGE);
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const { running } = useGameSync();
  const report = useQuery({
    queryKey: ['games-report', gamesDays, gamesSpeeds, running],
    queryFn: () => api.gamesReport(gamesDays, gamesSpeeds),
    enabled: !running,
  });
  const qc = useQueryClient();
  const restore = useMutation({ mutationFn: api.restoreInbox, onSuccess: () => qc.invalidateQueries({ queryKey: ['games-report'] }) });
  const byId = new Map((reps.data ?? []).map((r) => [r.id, r]));
  const r = report.data;
  const items = r?.inbox[tab] ?? [];

  return (
    <div className="games-page stack">
      <PageHeader
        title="Mes parties"
        subtitle={
          <Link to="/settings#parties" title="Changer dans les paramètres" className="muted">
            {r ? `${plural(r.games, 'partie', 'parties')} · ` : ''}
            {PERIOD[gamesDays] ?? `${gamesDays} jours`} · {gamesSpeeds.map((s) => SPEED_NAMES[s] ?? s).join(', ')}
          </Link>
        }
        menu={[{ label: 'Réafficher les éléments ignorés', onClick: () => restore.mutate() }]}
      />
      <GameSyncInline />

      {report.isLoading && <p className="muted">Analyse de vos parties…</p>}
      {report.error && <p className="error">{String(report.error)}</p>}
      {r && r.games === 0 && (
        <EmptyState title="Aucune partie" action={<Button to="/settings#parties">Paramètres des parties</Button>}>
          Importez vos parties Chess.com ou Lichess, ou élargissez la période et les cadences.
        </EmptyState>
      )}

      {r && r.games > 0 && (
        <>
          <Tabs
            block
            value={tab}
            onChange={(t) => {
              setTab(t);
              setShown(PAGE);
            }}
            tabs={[
              { id: 'novelties', label: `Nouveautés (${r.inbox.novelties.length})` },
              { id: 'deviations', label: `Écarts (${r.inbox.deviations.length})` },
              { id: 'ends', label: `Fins de ligne (${r.inbox.ends.length})` },
            ]}
          />
          <p className="muted small-text" style={{ margin: 0 }}>{KIND_HINT[tab]} Du plus fréquent au moins fréquent.</p>
          {items.length === 0 && <p className="muted">Rien ici.</p>}
          {items.slice(0, shown).map((item) => (
            <InboxRow key={item.key} item={item} rep={byId.get(item.repertoireId)} />
          ))}
          {items.length > shown && (
            <Button variant="ghost" onClick={() => setShown(shown + PAGE)}>Voir plus ({items.length - shown})</Button>
          )}

          <RepertoireStats report={r} reps={byId} />
          <RecentGames report={r} reps={byId} />
        </>
      )}
    </div>
  );
}

function ResultBar({ results }: { results: Results }) {
  const n = results.win + results.draw + results.loss || 1;
  return (
    <span className="result-bar" title={`${results.win} gagnées · ${results.draw} nulles · ${results.loss} perdues`}>
      <span className="win" style={{ width: pct(results.win / n) }} />
      <span className="draw" style={{ width: pct(results.draw / n) }} />
      <span className="loss" style={{ width: pct(results.loss / n) }} />
    </span>
  );
}

function RepertoireStats({ report, reps }: { report: GamesReport; reps: Map<string, RepertoireSummary> }) {
  const rows = report.repertoires.filter((x) => x.games > 0).sort((a, b) => b.games - a.games);
  const colors: Color[] = ['white', 'black'];
  return (
    <section className="card">
      <h3>Par répertoire</h3>
      <div className="table-wrap">
        <table className="lines">
          <thead>
            <tr>
              <th />
              <th>Parties</th>
              <th>Score</th>
              <th title="Nombre moyen de coups joués dans votre préparation">Dans la théorie</th>
            </tr>
          </thead>
          {colors.map((color) => {
            const own = rows.filter((x) => reps.get(x.id)?.color === color);
            const out = report.outside.filter((o) => o.color === color);
            if (!own.length && !out.length) return null;
            return (
              <tbody key={color}>
                {own.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <span className={`dot ${color}`} /> <Link to={`/r/${x.id}`}>{reps.get(x.id)?.name}</Link>
                    </td>
                    <td>{x.games}</td>
                    <td className="meter-cell">
                      {pct(score(x.results))} <ResultBar results={x.results} />
                    </td>
                    <td>{x.bookMoves.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} coups</td>
                  </tr>
                ))}
                {out.slice(0, 4).map((o) => (
                  <tr key={o.move} className="muted">
                    <td title="Vous avez joué un autre premier coup que dans vos répertoires">
                      <span className={`dot ${color}`} /> hors répertoire : {o.move}
                    </td>
                    <td>{o.games}</td>
                    <td className="meter-cell">
                      {pct(score(o.results))} <ResultBar results={o.results} />
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}

function InboxRow({ item, rep }: { item: InboxItem; rep: RepertoireSummary | undefined }) {
  const qc = useQueryClient();
  const [done, setDone] = useState<string | null>(null);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['games-report'] });
    await qc.invalidateQueries({ queryKey: ['repertoire', item.repertoireId] });
  };
  const add = useMutation({
    mutationFn: (ucis: string[]) => api.saveLine(item.repertoireId, ucis),
    onSuccess: async (res) => {
      setDone(`${plural(res.added, 'coup ajouté', 'coups ajoutés')} à ${rep?.name ?? 'votre répertoire'}.`);
      await refresh();
    },
  });
  const review = useMutation({
    mutationFn: () => api.reviewNow(item.repertoireId, item.fen),
    onSuccess: () => setDone('À revoir dès maintenant.'),
  });
  const dismiss = useMutation({ mutationFn: () => api.dismissInbox(item.key), onSuccess: refresh });

  const line = item.line.sans;
  const afterMove = [...item.line.ucis, item.move.uci];
  const after = [...line, item.move.san];
  const explorer = `/explorer?${new URLSearchParams({ line: afterMove.join(','), ...(rep?.color === 'black' ? { color: 'black' } : {}) })}`;
  const editor = `/r/${item.repertoireId}?${new URLSearchParams({ line: afterMove.join(',') })}`;
  const error = add.error ?? review.error ?? dismiss.error;

  // Thumbnail: the position, with the opponent's move (orange) or my move (red) and the prepared ones (green).
  const arrows: MiniArrow[] =
    item.kind === 'deviation'
      ? [
          ...item.expected.flatMap((san) => {
            const m = playSanOn(positionFromFen(item.fen), san);
            return m ? [{ uci: m.uci, kind: 'repertoire' as const }] : [];
          }),
          { uci: item.move.uci, kind: 'mistake' },
        ]
      : [{ uci: item.move.uci, kind: 'popular' }];

  return (
    <article className="card game-card">
      <MiniBoard fen={item.fen} orientation={rep?.color ?? 'white'} arrows={arrows} />
      <div className="game-card-body">
      <div className="inbox-head">
        <span className="muted">{lineText(line) || 'Position initiale'} </span>
        <span className="hole-move">{moveText(line, item.move.san)}</span>
      </div>
      <div className="row small-text" style={{ margin: '4px 0' }}>
        <span className="rep-tag"><span className={`dot ${rep?.color ?? 'white'}`} /> {rep?.name ?? '?'}</span>
        <span className="muted">
          {plural(item.games, 'partie', 'parties')} · score {pct(score(item.results))} · dernière le {date(item.lastPlayedAt)} ·{' '}
          <a href={item.example} target="_blank" rel="noreferrer">voir une partie ↗</a>
        </span>
      </div>
      <div className="inbox-body">
        {item.kind === 'deviation' && (
          <span>
            Vous avez joué <strong>{moveText(line, item.move.san, true)}</strong> au lieu de{' '}
            <strong>{item.expected.map((s) => moveText(line, s, true)).join(' ou ')}</strong>.{' '}
          </span>
        )}
        {item.kind === 'end' && <span>Votre ligne s’arrête ici. </span>}
        {item.replies.length > 0 && (
          <span className="muted">
            Vos réponses : {item.replies.slice(0, 3).map((x) => `${moveText(after, x.san, true)} (${x.games}, ${pct(score(x.results))})`).join(', ')}.
          </span>
        )}
      </div>
      <div className="row inbox-actions">
        {item.kind === 'deviation' && (
          <>
            <Button size="sm" variant="primary" disabled={review.isPending} onClick={() => review.mutate()} title="Rendre cette position à revoir maintenant">
              Revoir maintenant
            </Button>
            <Button size="sm" disabled={add.isPending} onClick={() => add.mutate(afterMove)} title="Accepter votre coup comme autre réponse">
              Ajouter {moveText(line, item.move.san, true)}
            </Button>
          </>
        )}
        {item.kind !== 'deviation' &&
          item.replies.slice(0, 2).map((x, i) => (
            <Button key={x.uci} size="sm" variant={i === 0 ? 'primary' : 'secondary'} disabled={add.isPending} onClick={() => add.mutate([...afterMove, x.uci])}>
              Ajouter {moveText(line, item.move.san, true)} {moveText(after, x.san)}
            </Button>
          ))}
        {item.kind === 'end' && item.replies.length === 0 && (
          <Button size="sm" variant="primary" disabled={add.isPending} onClick={() => add.mutate(afterMove)}>
            Ajouter {moveText(line, item.move.san, true)}
          </Button>
        )}
        <Button size="sm" variant="ghost" to={explorer} title="Statistiques, parties et moteur pour cette position">Explorer</Button>
        <Button size="sm" variant="ghost" to={editor} title="Choisir un autre coup dans l’éditeur">Éditeur</Button>
        <Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate()} title="Masquer cet élément">Ignorer</Button>
      </div>
      {done && <p className="success-text small-text">{done}</p>}
      {error && <p className="error small-text">{error.message}</p>}
      </div>
    </article>
  );
}

const KIND_TEXT = {
  'in-book': 'restée dans la théorie',
  'my-deviation': 'écart de votre part',
  'opponent-novelty': 'nouveauté adverse',
  'end-of-prep': 'après la fin de votre ligne',
  outside: 'hors de vos répertoires',
} as const;
const RESULT = { win: 'gagnée', draw: 'nulle', loss: 'perdue' } as const;

function RecentGames({ report, reps }: { report: GamesReport; reps: Map<string, RepertoireSummary> }) {
  return (
    <details className="panel">
      <summary>Dernières parties</summary>
      <div className="table-wrap">
        <table className="lines">
          <tbody>
            {report.recent.map((g) => (
              <tr key={g.id}>
                <td className="muted">{date(g.playedAt)}</td>
                <td>
                  <span className={`dot ${g.color}`} /> {g.opponent} <span className="muted">{g.opponentRating}</span>
                </td>
                <td className={`result ${g.result}`}>{RESULT[g.result]}</td>
                <td>{g.repertoireId ? reps.get(g.repertoireId)?.name : '—'}</td>
                <td className="small-text">
                  {g.move ? `${moveText(new Array(g.ply).fill(''), g.move.san, true)} : ` : ''}
                  {KIND_TEXT[g.kind]}
                </td>
                <td>
                  <Link className="small-text" to={`/explorer?${new URLSearchParams({ line: g.ucis.join(','), ...(g.color === 'black' ? { color: 'black' } : {}) })}`}>
                    explorer
                  </Link>{' '}
                  <a className="small-text" href={g.url} target="_blank" rel="noreferrer">partie ↗</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
