import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type SyncState } from '../api';
import { locale, t } from '../i18n';
import { Button, plural } from '../ui';

const SOURCES = { chesscom: 'Chess.com', lichess: 'Lichess' } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

/** Sync state of the user's games; polls while a sync runs. */
export function useGameSync() {
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: ['game-sync'],
    queryFn: api.syncState,
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status === 'running') ? 1500 : false),
  });
  const start = useMutation({
    mutationFn: api.startSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['game-sync'] }),
  });
  const running = state.data?.jobs.some((j) => j.status === 'running') ?? false;
  return { state: state.data, start, running };
}

/** One line per site: account, games imported, last sync, progress, button. */
export function GameSyncRows({ state, onSync }: { state: SyncState; onSync: (s: 'chesscom' | 'lichess') => void }) {
  return (
    <div>
      {(['chesscom', 'lichess'] as const).map((source) => {
        const account = state.accounts[source];
        const job = state.jobs.find((j) => j.source === source);
        const last = state.syncs.find((s) => s.source === source);
        return (
          <div className="sync-row" key={source}>
            <div className="what">
              <strong>{SOURCES[source]}</strong>{' '}
              {account ? <span className="muted">· {account}</span> : null}
              <div className="muted small-text">
                {!account &&
                  (source === 'chesscom'
                    ? t('Indiquez votre pseudo Chess.com ci-dessus.', 'Enter your Chess.com username above.')
                    : t('Liez votre compte Lichess ci-dessus.', 'Link your Lichess account above.'))}
                {account && t(plural(state.counts[source] ?? 0, 'partie importée', 'parties importées'), plural(state.counts[source] ?? 0, 'game imported', 'games imported'))}
                {last && t(` · dernière synchro le ${date(last.syncedAt)}`, ` · last synced ${date(last.syncedAt)}`)}
                {job?.status === 'running' &&
                  t(
                    ` · synchro… ${job.progress ? `mois ${job.progress.done}/${job.progress.total}, ` : ''}${plural(job.added, 'nouvelle', 'nouvelles')}`,
                    ` · syncing… ${job.progress ? `month ${job.progress.done}/${job.progress.total}, ` : ''}${plural(job.added, 'new', 'new')}`,
                  )}
                {job?.status === 'done' && ` · ${t(plural(job.added, 'nouvelle partie', 'nouvelles parties'), plural(job.added, 'new game', 'new games'))}`}
                {job?.status === 'done' && job.reviews
                  ? ` · ${t(plural(job.reviews, 'position à revoir', 'positions à revoir'), plural(job.reviews, 'position to review', 'positions to review'))}`
                  : ''}
              </div>
              {job?.status === 'error' && <div className="error small-text">{job.error}</div>}
            </div>
            <Button size="sm" icon="sync" disabled={!account || job?.status === 'running'} onClick={() => onSync(source)}>
              {last ? t('Synchroniser', 'Sync') : t('Importer mes parties', 'Import my games')}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** Compact sync status with a button, for the home page. */
export function GameSyncInline() {
  const { state, start, running } = useGameSync();
  if (!state) return null;
  const linked = (['chesscom', 'lichess'] as const).filter((s) => state.accounts[s]);
  if (!linked.length) {
    return (
      <p className="muted small-text">
        {t(
          <>
            <Link to="/account#accounts">Liez Chess.com ou Lichess</Link> pour analyser vos parties.
          </>,
          <>
            <Link to="/account#accounts">Link Chess.com or Lichess</Link> to analyse your games.
          </>,
        )}
      </p>
    );
  }
  const last = state.syncs.map((s) => s.syncedAt).sort().at(-1);
  return (
    <div className="row">
      <span className="muted small-text" style={{ margin: 0, flex: 1 }}>
        {running
          ? t('Synchronisation en cours…', 'Syncing…')
          : last
            ? t(`Dernière synchro le ${date(last)}`, `Last synced ${date(last)}`)
            : t('Parties pas encore importées', 'Games not imported yet')}
      </span>
      <Button size="sm" variant="ghost" icon="sync" disabled={running} onClick={() => linked.forEach((s) => start.mutate(s))}>
        {t('Synchroniser', 'Sync')}
      </Button>
    </div>
  );
}
