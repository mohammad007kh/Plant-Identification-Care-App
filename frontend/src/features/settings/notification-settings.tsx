'use client';

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import type { NotificationPreferences } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { isPushSupported, subscribeToPushNotifications } from './push-subscribe';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from './use-notification-prefs';

type PushBannerState = 'idle' | 'subscribing' | 'subscribed' | 'denied' | 'error';

type ToggleField = keyof NotificationPreferences;

/**
 * US7/FR-022 settings panel: email + web-push care-reminder toggles bound to
 * `PATCH /v1/account/notifications` (optimistic, with rollback on error —
 * FR-022 requires an off-toggle to take effect immediately), plus a
 * best-effort "enable browser notifications" action (FR-020) that requests
 * `Notification` permission and registers a push subscription. Email stays
 * fully usable regardless of whether browser push is available on this
 * device (FR-030 graceful degradation).
 */
export function NotificationSettings() {
  const messages = getMessages(defaultLocale).notificationPrefs;
  const accessToken = useAuthStore((state) => state.accessToken);
  const preferencesQuery = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();

  // Computed post-mount only: on the server (and on first client render,
  // before hydration) `window`/`navigator` push APIs are unavailable, so
  // starting from `false` here avoids a hydration mismatch versus deciding
  // this synchronously during render.
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBannerState, setPushBannerState] = useState<PushBannerState>('idle');

  useEffect(() => {
    setPushSupported(isPushSupported());
  }, []);

  const preferences = preferencesQuery.data;

  const handleToggle = (field: ToggleField) => {
    if (!preferences) return;
    updateMutation.mutate({ [field]: !preferences[field] });
  };

  const handleEnablePush = async () => {
    if (!accessToken) return;

    setPushBannerState('subscribing');
    const result = await subscribeToPushNotifications(accessToken);

    if (result.status === 'subscribed') {
      setPushBannerState('subscribed');
      updateMutation.mutate({ notifPushEnabled: true });
      return;
    }
    if (result.status === 'permission-denied') {
      setPushBannerState('denied');
      return;
    }
    if (result.status === 'unsupported') {
      setPushSupported(false);
      return;
    }
    setPushBannerState('error');
  };

  if (preferencesQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 2 }} data-testid="notification-settings-loading">
        <CircularProgress size={24} aria-label={messages.loadingLabel} />
      </Stack>
    );
  }

  if (preferencesQuery.isError || !preferences) {
    return (
      <Alert severity="error" data-testid="notification-settings-error">
        {messages.loadErrorMessage}
      </Alert>
    );
  }

  return (
    <Stack spacing={2} data-testid="notification-settings">
      <div>
        <Typography variant="subtitle1" component="h3">
          {messages.sectionTitle}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {messages.sectionDescription}
        </Typography>
      </div>

      {updateMutation.isError && (
        <Alert severity="error" data-testid="notification-settings-update-error">
          {messages.updateErrorMessage}
        </Alert>
      )}

      <FormControlLabel
        control={
          <Switch
            checked={preferences.notifEmailEnabled}
            onChange={() => handleToggle('notifEmailEnabled')}
            disabled={updateMutation.isPending}
          />
        }
        label={messages.emailToggleLabel}
      />

      <FormControlLabel
        control={
          <Switch
            checked={preferences.notifPushEnabled}
            onChange={() => handleToggle('notifPushEnabled')}
            disabled={updateMutation.isPending}
          />
        }
        label={messages.pushToggleLabel}
      />

      {!pushSupported && (
        <Alert severity="info" data-testid="notification-settings-push-unsupported">
          {messages.pushUnsupportedMessage}
        </Alert>
      )}

      {pushSupported && (
        <Stack spacing={1} alignItems="flex-start">
          <Button
            type="button"
            variant="outlined"
            onClick={handleEnablePush}
            disabled={pushBannerState === 'subscribing'}
            data-testid="notification-settings-enable-push-button"
          >
            {pushBannerState === 'subscribing'
              ? messages.enablingPushButton
              : messages.enablePushButton}
          </Button>

          {pushBannerState === 'subscribed' && (
            <Alert severity="success" data-testid="notification-settings-push-subscribed">
              {messages.pushSubscribedMessage}
            </Alert>
          )}
          {pushBannerState === 'denied' && (
            <Alert severity="warning" data-testid="notification-settings-push-denied">
              {messages.pushPermissionDeniedMessage}
            </Alert>
          )}
          {pushBannerState === 'error' && (
            <Alert severity="warning" data-testid="notification-settings-push-error">
              {messages.pushErrorMessage}
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  );
}

export default NotificationSettings;
