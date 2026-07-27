'use client';

import { useState, type FormEvent } from 'react';
import type { AdminUserSummary, TierKey } from 'shared';
import { tierKeySchema } from 'shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAdminUsers, useAdminUserAction } from './use-admin';

type TierChoice = TierKey | '';

interface UserActionPanelProps {
  messages: ReturnType<typeof getMessages>['admin']['users'];
  user: AdminUserSummary;
  onClose: () => void;
}

/** Tier-change + credit-adjustment form for a single selected user, gated by a confirm dialog. */
function UserActionPanel({ messages, user, onClose }: UserActionPanelProps) {
  const [tier, setTier] = useState<TierChoice>('');
  const [creditAdjustment, setCreditAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const actionMutation = useAdminUserAction();

  const handleOpenConfirm = (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);

    const trimmedAdjustment = creditAdjustment.trim();
    const parsedAdjustment = trimmedAdjustment === '' ? undefined : Number(trimmedAdjustment);

    if (reason.trim().length === 0) {
      setValidationError(messages.actionForm.errors.reasonRequired);
      return;
    }
    if (tier === '' && (parsedAdjustment === undefined || parsedAdjustment === 0)) {
      setValidationError(messages.actionForm.errors.noChangeSelected);
      return;
    }
    if (parsedAdjustment !== undefined && !Number.isInteger(parsedAdjustment)) {
      setValidationError(messages.actionForm.errors.noChangeSelected);
      return;
    }

    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    const trimmedAdjustment = creditAdjustment.trim();
    const parsedAdjustment = trimmedAdjustment === '' ? undefined : Number(trimmedAdjustment);

    actionMutation.mutate(
      {
        publicId: user.publicId,
        payload: {
          reason: reason.trim(),
          tier: tier === '' ? undefined : tier,
          creditAdjustment: parsedAdjustment,
        },
      },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setTier('');
          setCreditAdjustment('');
          setReason('');
        },
      },
    );
  };

  return (
    <Card variant="outlined" data-testid="users-admin-detail">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="subtitle1" component="h3">
            {user.email}
          </Typography>
          <Button type="button" size="small" onClick={onClose}>
            {messages.closeButton}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {messages.currentTierLabel}:{' '}
          {tierKeySchema.safeParse(user.tier).success ? user.tier : '-'}
          {' · '}
          {messages.creditBalanceLabel}: {user.creditBalance}
        </Typography>

        <Stack
          component="form"
          spacing={2}
          onSubmit={handleOpenConfirm}
          noValidate
          data-testid="users-admin-action-form"
        >
          <TextField
            select
            label={messages.actionForm.tierLabel}
            value={tier}
            onChange={(event) => setTier(event.target.value as TierChoice)}
            fullWidth
          >
            <MenuItem value="">{messages.actionForm.tierNoChangeOption}</MenuItem>
            <MenuItem value="free">{messages.tierLabels.free}</MenuItem>
            <MenuItem value="pro">{messages.tierLabels.pro}</MenuItem>
            <MenuItem value="max">{messages.tierLabels.max}</MenuItem>
          </TextField>

          <TextField
            type="number"
            label={messages.actionForm.creditAdjustmentLabel}
            helperText={messages.actionForm.creditAdjustmentHint}
            value={creditAdjustment}
            onChange={(event) => setCreditAdjustment(event.target.value)}
            fullWidth
          />

          <TextField
            label={messages.actionForm.reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          {validationError && (
            <Alert severity="warning" data-testid="users-admin-validation-error">
              {validationError}
            </Alert>
          )}
          {actionMutation.isError && (
            <Alert severity="error" data-testid="users-admin-action-error">
              {messages.actionForm.errors.submitFailed}
            </Alert>
          )}
          {actionMutation.isSuccess && (
            <Alert severity="success" data-testid="users-admin-action-success">
              {messages.actionForm.successMessage}
            </Alert>
          )}

          <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }}>
            {messages.actionForm.submitButton}
          </Button>
        </Stack>
      </CardContent>

      <Dialog
        open={isConfirmOpen}
        onClose={() => setConfirmOpen(false)}
        aria-labelledby="users-admin-confirm-title"
        data-testid="users-admin-confirm-dialog"
      >
        <DialogTitle id="users-admin-confirm-title">{messages.confirmDialog.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{messages.confirmDialog.body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            type="button"
            autoFocus
            onClick={() => setConfirmOpen(false)}
            data-testid="users-admin-confirm-cancel"
          >
            {messages.confirmDialog.cancelButton}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="warning"
            disabled={actionMutation.isPending}
            onClick={handleConfirm}
            data-testid="users-admin-confirm-submit"
          >
            {actionMutation.isPending
              ? messages.confirmDialog.confirmingButton
              : messages.confirmDialog.confirmButton}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

/**
 * User search/detail/administrative-action panel (US9, FR-026): free-text
 * search by email or `publicId`, a result list, and — per selected user — a
 * tier-change/credit-adjustment form gated by an explicit confirm dialog
 * (Station 17 "administrative actions are confirmed" domain rule). Every
 * action is audited server-side via the required `reason` field.
 */
export function UsersAdmin() {
  const messages = getMessages(defaultLocale).admin.users;
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const usersQuery = useAdminUsers(search);

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput);
  };

  const users: AdminUserSummary[] = usersQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const selectedUser = users.find((user) => user.publicId === selectedUserId) ?? null;

  return (
    <Stack spacing={3} data-testid="users-admin">
      <Typography variant="h6" component="h2">
        {messages.heading}
      </Typography>

      <Stack
        component="form"
        direction="row"
        spacing={1}
        onSubmit={handleSearchSubmit}
        data-testid="users-admin-search-form"
      >
        <TextField
          label={messages.searchLabel}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          data-testid="users-admin-search-input"
          fullWidth
        />
        <Button type="submit" variant="contained">
          {messages.searchButton}
        </Button>
      </Stack>

      {usersQuery.isLoading && (
        <Stack
          alignItems="center"
          spacing={2}
          role="status"
          aria-live="polite"
          data-testid="users-admin-loading"
          sx={{ py: 4 }}
        >
          <CircularProgress aria-label={messages.loadingLabel} />
          <Typography variant="body2">{messages.loadingLabel}</Typography>
        </Stack>
      )}

      {usersQuery.isError && (
        <Stack spacing={2} data-testid="users-admin-error">
          <Alert severity="error">{messages.errorMessage}</Alert>
          <Button type="button" variant="contained" onClick={() => usersQuery.refetch()}>
            {messages.retryButton}
          </Button>
        </Stack>
      )}

      {usersQuery.isSuccess && (
        <Stack spacing={2} data-testid="users-admin-list">
          {users.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              data-testid="users-admin-empty-state"
            >
              {messages.emptyState}
            </Typography>
          ) : (
            users.map((user) => (
              <Card
                key={user.publicId}
                variant="outlined"
                data-testid={`users-admin-user-${user.publicId}`}
              >
                <CardContent>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    spacing={2}
                  >
                    <div>
                      <Typography variant="body1">{user.email}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {user.role} · {user.status} · {user.creditBalance} {messages.creditsSuffix}
                      </Typography>
                    </div>
                    <Button
                      type="button"
                      variant="outlined"
                      size="small"
                      onClick={() => setSelectedUserId(user.publicId)}
                      data-testid={`users-admin-select-button-${user.publicId}`}
                    >
                      {messages.selectButton}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}

          {usersQuery.hasNextPage && (
            <Button
              type="button"
              variant="outlined"
              disabled={usersQuery.isFetchingNextPage}
              onClick={() => usersQuery.fetchNextPage()}
            >
              {usersQuery.isFetchingNextPage ? messages.loadingMoreButton : messages.loadMoreButton}
            </Button>
          )}
        </Stack>
      )}

      {selectedUser && (
        <UserActionPanel
          messages={messages}
          user={selectedUser}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </Stack>
  );
}

export default UsersAdmin;
