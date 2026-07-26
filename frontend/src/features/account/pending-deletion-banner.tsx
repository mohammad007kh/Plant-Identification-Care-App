'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAccountDeletionStatus, useCancelAccountDeletion } from './use-account-deletion';

/**
 * Persistent "pending deletion" banner (US8, FR-023): renders only while the
 * account's `deletionStatus` is `pending_deletion`, showing the scheduled
 * purge date and a prominent cancel action. Self-contained — it queries its
 * own status via `useAccountDeletionStatus` rather than taking it as a prop,
 * so mounting it once in the app shell (`T-137`) is all that's needed.
 *
 * Cancelling writes the resulting `active` status straight into the shared
 * query cache (see `useCancelAccountDeletion`), so the banner disappears
 * immediately — "cancel restores the normal UI immediately" (domain rule) —
 * with no extra refetch round trip.
 */
export function PendingDeletionBanner() {
  const messages = getMessages(defaultLocale).accountDeletion.pendingDeletionBanner;
  const statusQuery = useAccountDeletionStatus();
  const cancelMutation = useCancelAccountDeletion();

  if (statusQuery.data?.deletionStatus !== 'pending_deletion') {
    return null;
  }

  return (
    <Alert
      severity="warning"
      data-testid="pending-deletion-banner"
      action={
        <Button
          type="button"
          color="inherit"
          size="small"
          disabled={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate()}
          data-testid="pending-deletion-banner-cancel-button"
        >
          {cancelMutation.isPending ? messages.cancellingButton : messages.cancelButton}
        </Button>
      }
    >
      <Stack spacing={0.5}>
        <Typography variant="body2">
          {messages.messagePrefix} {statusQuery.data.purgeScheduledFor}
        </Typography>
        {cancelMutation.isError && (
          <Typography variant="body2" color="error" data-testid="pending-deletion-banner-error">
            {messages.errorMessage}
          </Typography>
        )}
      </Stack>
    </Alert>
  );
}

export default PendingDeletionBanner;
