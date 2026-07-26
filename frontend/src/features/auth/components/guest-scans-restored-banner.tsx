import Alert from '@mui/material/Alert';
import { defaultLocale, getMessages } from '@/i18n';

export interface GuestScansRestoredBannerProps {
  onDismiss?: () => void;
}

/**
 * FR-008: user-visible confirmation (not a generic "welcome" message) that
 * the guest's prior scans are now present in the new account. Rendered
 * exclusively on the wall→register path — see `registration-wall.tsx`,
 * which mounts this only when `justConvertedFromGuest` is set.
 */
export function GuestScansRestoredBanner({ onDismiss }: GuestScansRestoredBannerProps) {
  const messages = getMessages(defaultLocale).auth.guestScansRestored;

  return (
    <Alert severity="success" data-testid="guest-scans-restored-banner" onClose={onDismiss}>
      {messages.message}
    </Alert>
  );
}

export default GuestScansRestoredBanner;
