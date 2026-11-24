import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';

/** Back from Lichess after "Lier Lichess" in local mode (local/lichessLogin.ts). */
export function LichessCallback() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void import('../local/lichessLogin')
      .then((m) => m.finishLichessLogin(new URLSearchParams(location.search)))
      .then(async () => {
        await qc.invalidateQueries();
        navigate('/account', { replace: true });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [qc, navigate]);
  return error ? <p className="notice error">{error}</p> : <p className="muted">{t('Connexion à Lichess…', 'Connecting to Lichess…')}</p>;
}
