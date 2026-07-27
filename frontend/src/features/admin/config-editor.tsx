'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { AdminConfig, AdminTier } from 'shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import {
  useAdminConfig,
  useAdminTiers,
  useUpdateAdminConfig,
  useUpdateAdminTier,
} from './use-admin';

const configFormSchema = z.object({
  allowedPhotoFileTypes: z.string().min(1),
  creditIdentify: z.number().int().nonnegative(),
  creditChat: z.number().int().nonnegative(),
  creditComparison: z.number().int().nonnegative(),
  wateringSubject: z.string().min(1),
  wateringBody: z.string().min(1),
  customSubject: z.string().min(1),
  customBody: z.string().min(1),
  sendHour: z.number().int().min(0).max(23),
});
type ConfigFormValues = z.infer<typeof configFormSchema>;

function configToFormValues(config: AdminConfig): ConfigFormValues {
  return {
    allowedPhotoFileTypes: config.allowedPhotoFileTypes.join(', '),
    creditIdentify: config.creditCosts.identify,
    creditChat: config.creditCosts.chat,
    creditComparison: config.creditCosts.comparison,
    wateringSubject: config.notification.templates.watering.subject,
    wateringBody: config.notification.templates.watering.bodyFa,
    customSubject: config.notification.templates.custom.subject,
    customBody: config.notification.templates.custom.bodyFa,
    sendHour: config.notification.sendHourLocalTehran,
  };
}

/**
 * Live operational config editor (US9, FR-005/FR-021/FR-027): allowed photo
 * upload MIME types, per-action credit costs, and the two notification
 * templates + their local send hour. Every write round-trips through the
 * SAME `updateAdminConfigRequestSchema` the backend `AppConfigService` reads
 * live with — no deploy required for a change to take effect.
 */
export function ConfigEditor() {
  const messages = getMessages(defaultLocale).admin.config;
  const configQuery = useAdminConfig();
  const updateMutation = useUpdateAdminConfig();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
  });

  useEffect(() => {
    if (configQuery.data) {
      reset(configToFormValues(configQuery.data));
    }
  }, [configQuery.data, reset]);

  const onSubmit = handleSubmit((values) => {
    updateMutation.mutate({
      allowedPhotoFileTypes: values.allowedPhotoFileTypes
        .split(',')
        .map((type) => type.trim())
        .filter((type) => type.length > 0),
      creditCosts: {
        identify: values.creditIdentify,
        chat: values.creditChat,
        comparison: values.creditComparison,
      },
      notification: {
        templates: {
          watering: { subject: values.wateringSubject, bodyFa: values.wateringBody },
          custom: { subject: values.customSubject, bodyFa: values.customBody },
        },
        sendHourLocalTehran: values.sendHour,
      },
    });
  });

  if (configQuery.isLoading) {
    return (
      <Stack
        alignItems="center"
        spacing={2}
        role="status"
        aria-live="polite"
        data-testid="config-editor-loading"
        sx={{ py: 4 }}
      >
        <CircularProgress aria-label={messages.loadingLabel} />
        <Typography variant="body2">{messages.loadingLabel}</Typography>
      </Stack>
    );
  }

  if (configQuery.isError) {
    return (
      <Stack spacing={2} data-testid="config-editor-error">
        <Alert severity="error">{messages.errorMessage}</Alert>
        <Button type="button" variant="contained" onClick={() => configQuery.refetch()}>
          {messages.retryButton}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} data-testid="config-editor">
      <Typography variant="h6" component="h2">
        {messages.heading}
      </Typography>

      <Stack
        component="form"
        onSubmit={onSubmit}
        spacing={3}
        noValidate
        data-testid="config-editor-form"
      >
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" component="h3" gutterBottom>
              {messages.photoTypes.heading}
            </Typography>
            <TextField
              {...register('allowedPhotoFileTypes')}
              label={messages.photoTypes.fieldLabel}
              helperText={
                errors.allowedPhotoFileTypes
                  ? messages.photoTypes.errors.required
                  : messages.photoTypes.fieldHint
              }
              error={!!errors.allowedPhotoFileTypes}
              fullWidth
            />
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" component="h3" gutterBottom>
              {messages.creditCosts.heading}
            </Typography>
            <Stack spacing={2}>
              <TextField
                {...register('creditIdentify', { valueAsNumber: true })}
                type="number"
                label={messages.creditCosts.identifyLabel}
                error={!!errors.creditIdentify}
                fullWidth
              />
              <TextField
                {...register('creditChat', { valueAsNumber: true })}
                type="number"
                label={messages.creditCosts.chatLabel}
                error={!!errors.creditChat}
                fullWidth
              />
              <TextField
                {...register('creditComparison', { valueAsNumber: true })}
                type="number"
                label={messages.creditCosts.comparisonLabel}
                error={!!errors.creditComparison}
                fullWidth
              />
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" component="h3" gutterBottom>
              {messages.notification.heading}
            </Typography>
            <Stack spacing={2}>
              <Typography variant="body2" fontWeight="bold">
                {messages.notification.wateringHeading}
              </Typography>
              <TextField
                {...register('wateringSubject')}
                label={messages.notification.subjectLabel}
                error={!!errors.wateringSubject}
                fullWidth
              />
              <TextField
                {...register('wateringBody')}
                label={messages.notification.bodyLabel}
                error={!!errors.wateringBody}
                multiline
                minRows={2}
                fullWidth
              />

              <Typography variant="body2" fontWeight="bold" sx={{ mt: 1 }}>
                {messages.notification.customHeading}
              </Typography>
              <TextField
                {...register('customSubject')}
                label={messages.notification.subjectLabel}
                error={!!errors.customSubject}
                fullWidth
              />
              <TextField
                {...register('customBody')}
                label={messages.notification.bodyLabel}
                error={!!errors.customBody}
                multiline
                minRows={2}
                fullWidth
              />

              <TextField
                {...register('sendHour', { valueAsNumber: true })}
                type="number"
                label={messages.notification.sendHourLabel}
                helperText={messages.notification.sendHourHint}
                error={!!errors.sendHour}
                fullWidth
              />
            </Stack>
          </CardContent>
        </Card>

        {updateMutation.isError && (
          <Alert severity="error" data-testid="config-editor-submit-error">
            {messages.submitErrorMessage}
          </Alert>
        )}
        {updateMutation.isSuccess && (
          <Alert severity="success" data-testid="config-editor-submit-success">
            {messages.submitSuccessMessage}
          </Alert>
        )}

        <Button
          type="submit"
          variant="contained"
          disabled={updateMutation.isPending}
          sx={{ alignSelf: 'flex-start' }}
        >
          {updateMutation.isPending ? messages.savingButton : messages.saveButton}
        </Button>
      </Stack>

      <TierAllowancesSection messages={messages.tiers} />
    </Stack>
  );
}

interface TierAllowancesSectionProps {
  messages: ReturnType<typeof getMessages>['admin']['config']['tiers'];
}

/**
 * Per-tier credit allowance/price/active editor (FR-014/FR-019/FR-027's
 * "tier allowances" part of the config editor). Each tier row is its own
 * independent form/submit — kept OUTSIDE the config-blob `<form>` above so
 * saving one tier never re-submits the unrelated photo-types/credit-costs/
 * notification fields (and to avoid nesting `<form>` elements, which is
 * invalid HTML).
 */
function TierAllowancesSection({ messages }: TierAllowancesSectionProps) {
  const tiersQuery = useAdminTiers();

  return (
    <Card variant="outlined" data-testid="config-tiers-section">
      <CardContent>
        <Typography variant="subtitle1" component="h3" gutterBottom>
          {messages.heading}
        </Typography>

        {tiersQuery.isLoading && (
          <Stack
            alignItems="center"
            spacing={2}
            role="status"
            aria-live="polite"
            data-testid="config-tiers-loading"
            sx={{ py: 2 }}
          >
            <CircularProgress aria-label={messages.loadingLabel} size={24} />
            <Typography variant="body2">{messages.loadingLabel}</Typography>
          </Stack>
        )}

        {tiersQuery.isError && (
          <Stack spacing={2} data-testid="config-tiers-error">
            <Alert severity="error">{messages.errorMessage}</Alert>
            <Button type="button" variant="contained" onClick={() => tiersQuery.refetch()}>
              {messages.retryButton}
            </Button>
          </Stack>
        )}

        {tiersQuery.isSuccess && (
          <Stack spacing={2} data-testid="config-tiers-list">
            {tiersQuery.data.map((tier) => (
              <TierRow key={tier.key} messages={messages} tier={tier} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

interface TierRowProps {
  messages: ReturnType<typeof getMessages>['admin']['config']['tiers'];
  tier: AdminTier;
}

function TierRow({ messages, tier }: TierRowProps) {
  const [allowance, setAllowance] = useState(String(tier.monthlyCreditAllowance));
  const [priceMinor, setPriceMinor] = useState(String(tier.priceMinor));
  const [active, setActive] = useState(tier.active);
  const updateMutation = useUpdateAdminTier();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    updateMutation.mutate({
      key: tier.key,
      monthlyCreditAllowance: Number(allowance),
      priceMinor: Number(priceMinor),
      active,
    });
  };

  return (
    <Stack
      component="form"
      onSubmit={handleSubmit}
      spacing={1}
      data-testid={`config-tier-form-${tier.key}`}
    >
      <Typography variant="body2" fontWeight="bold">
        {messages.tierLabels[tier.key] ?? tier.key}
      </Typography>
      <Stack direction="row" spacing={2}>
        <TextField
          type="number"
          label={messages.allowanceLabel}
          value={allowance}
          onChange={(event) => setAllowance(event.target.value)}
          fullWidth
        />
        <TextField
          type="number"
          label={messages.priceLabel}
          value={priceMinor}
          onChange={(event) => setPriceMinor(event.target.value)}
          fullWidth
        />
      </Stack>
      <FormControlLabel
        control={
          <Checkbox checked={active} onChange={(event) => setActive(event.target.checked)} />
        }
        label={messages.activeLabel}
      />

      {updateMutation.isError && (
        <Alert severity="error" data-testid={`config-tier-error-${tier.key}`}>
          {messages.submitErrorMessage}
        </Alert>
      )}
      {updateMutation.isSuccess && (
        <Alert severity="success" data-testid={`config-tier-success-${tier.key}`}>
          {messages.submitSuccessMessage}
        </Alert>
      )}

      <Button
        type="submit"
        variant="outlined"
        size="small"
        disabled={updateMutation.isPending}
        sx={{ alignSelf: 'flex-start' }}
      >
        {updateMutation.isPending ? messages.savingButton : messages.saveButton}
      </Button>
    </Stack>
  );
}

export default ConfigEditor;
