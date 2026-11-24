import { useState } from 'react';
import { useInstall } from '../pwa';
import { t } from '../i18n';
import { Button } from '../ui';

const SEEN_KEY = 'installPromptSeen';

/** "Install the app", once: on the first visit from a phone, when not already installed. */
export function InstallPrompt() {
  const install = useInstall();
  const [seen, setSeen] = useState(() => localStorage.getItem(SEEN_KEY) === '1');
  if (seen || install.installed || !install.mobile) return null;

  const close = () => {
    localStorage.setItem(SEEN_KEY, '1');
    setSeen(true);
  };

  return (
    <div className="install-prompt" role="dialog" aria-label={t('Installer l’application', 'Install the app')}>
      <strong>{t('Installer e4e5', 'Install e4e5')}</strong>
      <p className="small-text">{t('Une icône sur l’écran d’accueil, en plein écran, sans barre de navigateur.', 'An icon on the home screen, full screen, without a browser bar.')}</p>
      {!install.canPrompt && (
        <p className="small-text muted">
          {install.ios ? (
            t(
              <>Dans Safari : bouton <strong>Partager</strong> (le carré avec une flèche), puis <strong>Sur l’écran d’accueil</strong>.</>,
              <>In Safari: the <strong>Share</strong> button (the square with an arrow), then <strong>Add to Home Screen</strong>.</>,
            )
          ) : (
            t(
              <>Dans le menu du navigateur : <strong>Installer l’application</strong> (ou « Ajouter à l’écran d’accueil »).</>,
              <>In the browser menu: <strong>Install app</strong> (or “Add to Home screen”).</>,
            )
          )}
        </p>
      )}
      <div className="row">
        <Button size="sm" onClick={close}>{install.canPrompt ? t('Plus tard', 'Later') : 'OK'}</Button>
        {install.canPrompt && (
          <Button size="sm" variant="primary" onClick={() => void install.prompt().then(close)}>
            {t('Installer', 'Install')}
          </Button>
        )}
      </div>
    </div>
  );
}
