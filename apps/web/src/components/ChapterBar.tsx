/**
 * The chapters of the repertoire open in the editor, as in a Lichess study: one is open at a time
 * (its moves are on the board); the open one has its actions (rename, pause, order, move to
 * another repertoire, delete), and new chapters start at the initial position or on the board's.
 */
import type { Color } from '@e4e5/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ChapterInfo, type StoredMove } from '../api';
import { t } from '../i18n';
import { Button, Icon, Menu, plural, type MenuItem } from '../ui';
import { MoveChaptersDialog } from './MoveChaptersDialog';

export function ChapterBar({
  repertoireId,
  color,
  chapters,
  moves,
  current,
  boardFen,
  onSelect,
  onMovedAway,
}: {
  repertoireId: string;
  color: Color;
  chapters: ChapterInfo[];
  moves: StoredMove[];
  current: ChapterInfo | undefined;
  /** Position on the board (not the chapter's start): offered as the start of a new chapter. */
  boardFen: string | null;
  onSelect: (id: string) => void;
  /** The open chapter went to another repertoire. */
  onMovedAway: (repertoireId: string, chapterId: string) => void;
}) {
  const qc = useQueryClient();
  const [moving, setMoving] = useState(false);
  const count = new Map<string, number>();
  for (const m of moves) count.set(m.chapterId, (count.get(m.chapterId) ?? 0) + 1);
  /** The repertoire reloaded (awaited), what depends on it recomputed in the background. */
  const refresh = async () => {
    for (const key of ['repertoires', 'training-summary', 'gaps', 'games-report']) void qc.invalidateQueries({ queryKey: [key] });
    await qc.invalidateQueries({ queryKey: ['repertoire', repertoireId] });
  };
  const change = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: refresh });
  const create = useMutation({
    mutationFn: ({ name, startFen }: { name: string; startFen?: string }) =>
      api.createChapters(repertoireId, [{ name, ...(startFen ? { pgn: `[FEN "${startFen}"]\n[SetUp "1"]\n\n*` } : {}) }]),
    onSuccess: async ([created]) => {
      await refresh();
      if (created) onSelect(created.chapter.id);
    },
  });
  const askNew = (startFen?: string) => {
    const name = prompt(t('Nom du chapitre', 'Name of the chapter'), t(`Chapitre ${chapters.length + 1}`, `Chapter ${chapters.length + 1}`))?.trim();
    if (name) create.mutate({ name, startFen });
  };

  const index = current ? chapters.findIndex((c) => c.id === current.id) : -1;
  const reorder = (to: number) => {
    const ids = chapters.map((c) => c.id);
    const [id] = ids.splice(index, 1);
    ids.splice(to, 0, id!);
    change.mutate(() => api.reorderChapters(repertoireId, ids));
  };
  const actions: MenuItem[] = current
    ? [
        {
          label: t('Renommer le chapitre', 'Rename the chapter'),
          onClick: () => {
            const name = prompt(t('Nouveau nom', 'New name'), current.name)?.trim();
            if (name && name !== current.name) change.mutate(() => api.renameChapter(current.id, name));
          },
        },
        {
          label: current.active ? t('Mettre le chapitre en pause', 'Pause the chapter') : t('Reprendre le chapitre', 'Resume the chapter'),
          onClick: () => change.mutate(() => api.setChapterActive(current.id, !current.active)),
        },
        ...(index > 0 ? [{ label: t('Monter', 'Move up'), onClick: () => reorder(index - 1) }] : []),
        ...(index >= 0 && index < chapters.length - 1 ? [{ label: t('Descendre', 'Move down'), onClick: () => reorder(index + 1) }] : []),
        { label: t('Déplacer vers un autre répertoire…', 'Move to another repertoire…'), onClick: () => setMoving(true) },
        {
          label: t('Supprimer le chapitre', 'Delete the chapter'),
          danger: true,
          onClick: () => {
            if (confirm(t(`Supprimer le chapitre « ${current.name} » et tous ses coups ?`, `Delete the chapter “${current.name}” and all its moves?`))) {
              change.mutate(() => api.deleteChapter(current.id));
            }
          },
        },
      ]
    : [];

  return (
    <section className="panel chapter-bar">
      <div className="chapter-bar-head">
        <h3>{t('Chapitres', 'Chapters')}</h3>
        <Menu
          title={t('Nouveau chapitre', 'New chapter')}
          items={[
            { label: t('Nouveau chapitre', 'New chapter'), onClick: () => askNew() },
            ...(boardFen ? [{ label: t('Nouveau chapitre à partir de cette position', 'New chapter from this position'), onClick: () => askNew(boardFen) }] : []),
          ]}
        />
      </div>
      <ol className="chapter-items">
        {chapters.map((c, i) => (
          <li key={c.id} className={`chapter-item ${c.id === current?.id ? 'on' : ''} ${c.active ? '' : 'paused'}`}>
            <button type="button" className="chapter-pick" onClick={() => onSelect(c.id)} aria-current={c.id === current?.id}>
              <span className="chapter-num">{i + 1}</span>
              <span className="chapter-title">{c.name}</span>
              {!c.active && <Icon name="pause" size={13} />}
              <span className="muted small-text">{plural(count.get(c.id) ?? 0, t('coup', 'move'), t('coups', 'moves'))}</span>
            </button>
            {c.id === current?.id && <Menu items={actions} title={t('Actions du chapitre', 'Chapter actions')} />}
          </li>
        ))}
      </ol>
      {!chapters.length && (
        <div className="stack">
          <p className="muted small-text">{t('Ce répertoire n’a pas encore de chapitre.', 'This repertoire has no chapter yet.')}</p>
          <div>
            <Button size="sm" variant="primary" icon="plus" onClick={() => askNew()}>{t('Nouveau chapitre', 'New chapter')}</Button>
          </div>
        </div>
      )}
      {change.error && <p className="error small-text">{change.error.message}</p>}
      {create.error && <p className="error small-text">{create.error.message}</p>}
      {moving && current && (
        <MoveChaptersDialog
          chapterIds={[current.id]}
          color={color}
          from={repertoireId}
          onMoved={(to) => onMovedAway(to, current.id)}
          onClose={() => setMoving(false)}
        />
      )}
    </section>
  );
}
