import { playSanOn, positionFromFen, type Color } from '@prepa-cahier/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, type GamesReport, type InboxItem, type RepertoireSummary, type Results } from '../api';
import { lineText, moveText } from '../chessText';
import { GameSyncInline, useGameSync } from '../components/GameSync';
import { SPEED_NAMES, useSettings } from '../settings';
import { MiniBoard, type MiniArrow } from '../components/MiniBoard';
import { SwipeRow } from '../components/SwipeRow';
import { Button, EmptyState, PageHeader, Tabs, plural } from '../ui';

const PERIOD: Record<number, string> = { 30: '30 derniers jours', 90: '3 derniers mois', 365: '12 derniers mois', 0: 'toutes les parties' };
const pct = (x: number) => `${Math.round(100 * x)} %`;
const score = (r: Results) => {
  const n = r.win + r.draw + r.loss;
  return n ? (r.win + r.draw / 2) / n : 0;
};
const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const PAGE = 20;
const KIND_HINT = {
  errors: 'Vous avez joué autre chose que votre coup préparé.',
  novelties: 'L’adversaire a joué un coup auquel votre répertoire ne répond pas (en cours de ligne ou après sa fin).',
} as const;

/**
 * The games compared with the repertoires (period and speeds of the settings). Shared by the page
 * and the badge of the Mes parties tab (same query, computed once).
 */
export function useGamesReport() {
  const { gamesDays, gamesSpeeds } = useSettings();
  const { running } = useGameSync();
  return useQuery({
    queryKey: ['games-report', gamesDays, gamesSpeeds, running],
    queryFn: () => api.gamesReport(gamesDays, gamesSpeeds),
    enabled: !running,
    staleTime: 60_000,
  });
}

/** Mes parties: what the games show (cards with a thumbnail), results per repertoire, recent games. */
export function Games() {
  const { gamesDays, gamesSpeeds } = useSettings();
  const [tab, setTab] = useState<'errors' | 'novelties'>('errors');
  const [shown, setShown] = useState(PAGE);
  const [notice, setNotice] = useState<string | null>(null);
  const reps = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const report = useGamesReport();
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
              setNotice(null);
            }}
            tabs={[
              { id: 'errors', label: 'Erreurs' },
              { id: 'novelties', label: 'Nouveautés' },
            ]}
          />
          <p className="muted small-text" style={{ margin: 0 }}>{KIND_HINT[tab]} Du plus fréquent au moins fréquent.</p>
          {notice && (
            <p className="notice success">
              {notice} <Link to="/train">Entraîner</Link>
            </p>
          )}
          {items.length === 0 && <p className="muted">Rien ici.</p>}
          {items.slice(0, shown).map((item) => (
            <InboxRow key={item.key} item={item} rep={byId.get(item.repertoireId)} onDone={setNotice} />
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

/** The report without one inbox item (shown at once, before the server's new report). */
function withoutItem(r: GamesReport, item: InboxItem): GamesReport {
  const keep = (i: InboxItem) => i.key !== item.key;
  const wasError = r.inbox.errors.some((i) => i.key === item.key);
  return {
    ...r,
    inbox: {
      errors: r.inbox.errors.filter(keep),
      novelties: r.inbox.novelties.filter(keep),
      errorCount: Math.max(0, r.inbox.errorCount - (wasError ? 1 : 0)),
    },
  };
}

function InboxRow({ item, rep, onDone }: { item: InboxItem; rep: RepertoireSummary | undefined; onDone: (message: string) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Dealt with: off the list (and the badge of Mes parties) at once, then the new report; the
  // Entraîner badge counts a position sent to review.
  const hide = () => {
    qc.setQueriesData<GamesReport>({ queryKey: ['games-report'] }, (r) => r && withoutItem(r, item));
    void qc.invalidateQueries({ queryKey: ['games-report'] });
    void qc.invalidateQueries({ queryKey: ['training-summary'] });
  };
  /**
   * An error sent to review: the position is due now (if learnt: else it comes with the new
   * lines), and the error is dismissed (it comes back if played again in a later game).
   * Returns whether the position was learnt.
   */
  const sendToReview = async () => {
    let learnt = true;
    try {
      await api.reviewNow(item.repertoireId, item.fen);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
      learnt = false;
    }
    await api.dismissInbox(item.key);
    return learnt;
  };
  const position = lineText(item.line.sans) || 'la position initiale';
  const now = useMutation({
    mutationFn: sendToReview,
    onSuccess: () => {
      hide();
      navigate(`/r/${item.repertoireId}/train?${new URLSearchParams({ from: item.fen, mode: 'review' })}`);
    },
  });
  const later = useMutation({
    mutationFn: sendToReview,
    onSuccess: (learnt) => {
      hide();
      onDone(
        learnt
          ? `Ajoutée à vos révisions du jour : après ${position}.`
          : `Après ${position} : position pas encore apprise, elle viendra avec vos nouvelles lignes.`,
      );
    },
  });
  const dismiss = useMutation({ mutationFn: () => api.dismissInbox(item.key), onSuccess: hide });
  const busy = now.isPending || later.isPending || dismiss.isPending;

  const line = item.line.sans;
  const afterMove = [...item.line.ucis, item.move.uci];
  const after = [...line, item.move.san];
  // Opened on the line with the move (and, after an opponent's move, your usual reply) as a draft:
  // nothing is saved until "Enregistrer la variante".
  const draft = item.kind !== 'deviation' && item.replies[0] ? [...afterMove, item.replies[0].uci] : afterMove;
  const editor = `/r/${item.repertoireId}?${new URLSearchParams({ line: draft.join(',') })}`;
  const error = now.error ?? later.error ?? dismiss.error;

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

  const color = rep?.color ?? 'white';
  const dialog = useRef<HTMLDialogElement>(null);
  // The detail is only rendered while open (the board is measured when it is created).
  const [detail, setDetail] = useState(false);
  const open = () => {
    setDetail(true);
    dialog.current?.showModal();
  };

  const head = (
    <div className="inbox-head">
      <span className="muted inbox-line">{lineText(line) || 'Position initiale'} </span>
      <span className="hole-move">{moveText(line, item.move.san)}</span>
    </div>
  );
  const actions = (
    <div className="row inbox-actions">
      {item.kind === 'deviation' && (
        <>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => now.mutate()} title="Réviser cette position maintenant">
            Réviser
          </Button>
          <Button size="sm" disabled={busy} onClick={() => later.mutate()} title="Ajouter cette position à vos révisions du jour">
            Plus tard
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant={item.kind === 'deviation' ? 'ghost' : 'primary'}
        to={editor}
        title="Préparer dans l’éditeur : ouvrir le répertoire sur cette ligne (rien n’est enregistré sans votre accord)"
      >
        Préparer
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => dismiss.mutate()} title="Masquer cet élément">Ignorer</Button>
    </div>
  );
  const errorText = error && <p className="error small-text">{error.message}</p>;

  return (
    // On touch screens: swipe right to ignore, left to review later (errors).
    <SwipeRow
      right={{ label: 'Ignorer', action: () => dismiss.mutateAsync() }}
      left={item.kind === 'deviation' ? { label: 'Plus tard', action: () => later.mutateAsync() } : undefined}
    >
      {/* The whole card opens the detail, except its buttons and links. */}
      <article className="card game-card clickable" onClick={(e) => !(e.target as HTMLElement).closest('button, a') && open()}>
        <button type="button" className="thumb-button" onClick={open} aria-label="Voir le détail et les parties">
          <MiniBoard fen={item.fen} orientation={color} arrows={arrows} />
        </button>
        <div className="game-card-body">
          {head}
          <div className="row small-text game-card-meta">
            <span className="rep-tag"><span className={`dot ${color}`} /> {rep?.name ?? '?'}</span>
            <span className="muted">{plural(item.games, 'partie', 'parties')} · {pct(score(item.results))}</span>
          </div>
          {actions}
          {errorText}
        </div>

        <dialog
          ref={dialog}
          className="game-detail"
          onClose={() => setDetail(false)}
          // Not to the card (which would open it again); a click on the backdrop closes it.
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === dialog.current) dialog.current.close();
          }}
        >
          {detail && (
            <div className="game-detail-content stack">
              <div className="game-detail-top">
                <span className="rep-tag"><span className={`dot ${color}`} /> {rep?.name ?? '?'}</span>
                <Button size="sm" variant="ghost" onClick={() => dialog.current?.close()} title="Fermer">✕</Button>
              </div>
              <MiniBoard fen={item.fen} orientation={color} arrows={arrows} className="mini-board-large" />
              {head}
              <p className="inbox-body">
                {item.kind === 'deviation' && (
                  <>
                    Vous avez joué <strong>{moveText(line, item.move.san, true)}</strong> au lieu de{' '}
                    <strong>{item.expected.map((s) => moveText(line, s, true)).join(' ou ')}</strong>.{' '}
                  </>
                )}
                {item.kind === 'novelty' && <>L’adversaire a joué un coup que vous n’avez pas préparé. </>}
                {item.kind === 'end' && <>Votre ligne s’arrête ici. </>}
                {plural(item.games, 'partie', 'parties')}, score {pct(score(item.results))}
                {item.replies.length > 0 && (
                  <> · vos réponses : {item.replies.map((x) => `${moveText(after, x.san, true)} (${x.games}, ${pct(score(x.results))})`).join(', ')}</>
                )}
                .
              </p>
              {actions}
              {errorText}
              <div className="table-wrap">
                <table className="lines">
                  <tbody>
                    {item.gameList.map((g) => (
                      <tr key={g.url}>
                        <td className="muted">{date(g.playedAt)}</td>
                        <td>
                          {g.opponent} <span className="muted">{g.opponentRating ?? ''}</span>
                        </td>
                        <td className={`result ${g.result}`}>{RESULT[g.result]}</td>
                        {item.kind !== 'deviation' && <td className="small-text">{g.reply ? moveText(after, g.reply, true) : '—'}</td>}
                        <td>
                          <a className="small-text" href={g.url} target="_blank" rel="noreferrer">partie ↗</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </dialog>
      </article>
    </SwipeRow>
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
