import { Icon } from '../ui';

/** Start of the paused moves of a position: they and what only follows them are not trained. */
export function PausedZoneHeader({ target, dropAbove }: { target: boolean; dropAbove: boolean }) {
  return (
    <li data-paused-zone className={['paused-zone', target ? 'drop-target' : '', dropAbove ? 'drop-before' : ''].filter(Boolean).join(' ')}>
      <Icon name="pause" size={13} /> En pause : pas entraînés
    </li>
  );
}
