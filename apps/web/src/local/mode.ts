/**
 * Local mode (experimental, migration without a server): the repertoires, the training and the
 * played games are read and written in SQLite on this device instead of the server, and the
 * statistics are read in files downloaded on it; the rest still goes to the server. Turned on
 * and off in Paramètres, or with ?local=1 / ?local=0 in the address.
 */
// The keys of the app's former name (tabiya.…) are moved first.
import '../legacyNames';
import { isServerless } from '../native';

const KEY = 'e4e5.backend';

/** The API methods answered on this device in local mode (local/backend.ts). */
export const LOCAL_METHODS = [
  'me',
  'updateMe',
  'unlinkLichess',
  'logout',
  'repertoires',
  'createRepertoire',
  'renameRepertoire',
  'setRepertoireActive',
  'deleteRepertoire',
  'repertoire',
  'saveLine',
  'updateMove',
  'deleteMove',
  'importPgn',
  'positionRepertoires',
  'repertoireMovesAt',
  'cards',
  'review',
  'reviewNow',
  'syncState',
  'startSync',
  'gamesReport',
  'dismissInbox',
  'restoreInbox',
  'myGames',
  'myGameMoves',
  'opening',
  'explorer',
  'bestMoves',
  'gaps',
  'lichessStudiesBy',
  'lichessStudy',
] as const;
export type LocalMethod = (typeof LOCAL_METHODS)[number];

const fromUrl = new URLSearchParams(location.search).get('local');
if (fromUrl === '1') localStorage.setItem(KEY, 'local');
else if (fromUrl === '0') localStorage.removeItem(KEY);

/** Always without a server (mobile app, static hosting). */
export const isLocalMode = (): boolean => isServerless() || localStorage.getItem(KEY) === 'local';

/** Changes the mode and reloads the app (the API methods are chosen at start). */
export function setLocalMode(on: boolean) {
  if (on) localStorage.setItem(KEY, 'local');
  else localStorage.removeItem(KEY);
  location.reload();
}
