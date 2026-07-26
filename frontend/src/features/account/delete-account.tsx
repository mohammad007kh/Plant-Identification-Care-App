'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useRequestAccountDeletion } from './use-account-deletion';

/**
 * "Danger zone" delete-account action (US8, FR-023): the trigger button only
 * opens an explicit confirmation dialog — it never calls the API by itself.
 * The dialog states the 7-day grace period and that all data is permanently
 * removed afterward (domain rule), and the confirm button is worded and
 * colored as a deliberate, non-default action (plain "Cancel" is the
 * `autoFocus`ed one) so an accidental Enter/click never triggers it.
 *
 * Never performs the destructive deletion itself — only the backend's
 * scheduled purge job does that once the grace period elapses; this
 * component only starts it via `POST /v1/account/deletion`. The resulting
 * `pending_deletion` state is surfaced separately by `PendingDeletionBanner`
 * (mounted in the app shell by `T-137`), not by this component.
 */
export function DeleteAccount() {
  const messages = getMessages(defaultLocale).accountDeletion.deleteAccount;
  const [isDialogOpen, setDialogOpen] = useState(false);
  const requestMutation = useRequestAccountDeletion();

  const openDialog = () => {
    requestMutation.reset();
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
  };

  const handleConfirm = () => {
    requestMutation.mutate(undefined, {
      onSuccess: () => setDialogOpen(false),
    });
  };

  return (
    <Stack spacing={2} data-testid="delete-account">
      <div>
        <Typography variant="subtitle1" component="h3">
          {messages.sectionTitle}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {messages.sectionDescription}
        </Typography>
      </div>

      <Button
        type="button"
        variant="outlined"
        color="error"
        sx={{ alignSelf: 'flex-start' }}
        onClick={openDialog}
        data-testid="delete-account-trigger"
      >
        {messages.triggerButton}
      </Button>

      <Dialog
        open={isDialogOpen}
        onClose={closeDialog}
        aria-labelledby="delete-account-dialog-title"
      >
        <DialogTitle id="delete-account-dialog-title">{messages.dialogTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText>{messages.dialogBody}</DialogContentText>

          {requestMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }} data-testid="delete-account-error">
              {messages.errorMessage}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            type="button"
            autoFocus
            onClick={closeDialog}
            data-testid="delete-account-cancel-button"
          >
            {messages.cancelButton}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="error"
            disabled={requestMutation.isPending}
            onClick={handleConfirm}
            data-testid="delete-account-confirm-button"
          >
            {requestMutation.isPending ? messages.confirmingButton : messages.confirmButton}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default DeleteAccount;
