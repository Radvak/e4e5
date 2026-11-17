import { useState } from 'react';
import { useInstall } from '../pwa';
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
    <div className="install-prompt" role="dialog" aria-label="Installer l’application">
      <strong>Installer Tabiya</strong>
      <p className="small-text">Une icône sur l’écran d’accueil, en plein écran, sans barre de navigateur.</p>
      {!install.canPrompt && (
        <p className="small-text muted">
          {install.ios ? (
            <>Dans Safari : bouton <strong>Partager</strong> (le carré avec une flèche), puis <strong>Sur l’écran d’accueil</strong>.</>
          ) : (
            <>Dans le menu du navigateur : <strong>Installer l’application</strong> (ou « Ajouter à l’écran d’accueil »).</>
          )}
        </p>
      )}
      <div className="row">
        <Button size="sm" onClick={close}>{install.canPrompt ? 'Plus tard' : 'OK'}</Button>
        {install.canPrompt && (
          <Button size="sm" variant="primary" onClick={() => void install.prompt().then(close)}>
            Installer
          </Button>
        )}
      </div>
    </div>
  );
}
