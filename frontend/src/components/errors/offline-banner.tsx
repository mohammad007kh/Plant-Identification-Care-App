'use client';

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { defaultLocale, getMessages } from '@/i18n';

/**
 * Connectivity banner (T-161/FR-030, mounted once in the root `(fa)`
 * layout). Listens to the browser's `online`/`offline` events (plus the
 * initial `navigator.onLine` value, so a page loaded while already offline
 * shows the banner immediately) and displays a persistent Persian warning
 * while the client has no network connectivity — so a doomed request fails
 * with a clear explanation instead of an indefinite spinner. Renders
 * nothing once the browser reports it is back online.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);

    const handleOffline = (): void => setIsOffline(true);
    const handleOnline = (): void => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  const messages = getMessages(defaultLocale).errors.offlineBanner;

  return (
    <Snackbar open anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert
        severity="warning"
        variant="filled"
        data-testid="offline-banner"
        sx={{ width: '100%' }}
      >
        {messages.message}
      </Alert>
    </Snackbar>
  );
}

export default OfflineBanner;
