'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Plan } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { useCheckout } from '../hooks/use-checkout';
import { usePlans } from '../hooks/use-plans';
import { formatCreditAllowance, formatPlanPrice } from '../lib/format-price';
import { redirectToCheckout } from '../lib/redirect-to-checkout';
import { useBillingStore } from '../store/billing-store';

interface PlanOptionProps {
  plan: Plan;
  isSubmitting: boolean;
  onSelect: (planId: string) => void;
}

/** Single plan card + purchase CTA, rendered once per live `Plan` from `usePlans`. */
function PlanOption({ plan, isSubmitting, onSelect }: PlanOptionProps) {
  const messages = getMessages(defaultLocale).billing.upgradeModal;
  const tierLabel = messages.tierLabels[plan.key] ?? plan.key;

  return (
    <Card variant="outlined" data-testid={`upgrade-plan-${plan.key}`}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
          <Typography variant="subtitle1" component="h3">
            {tierLabel}
          </Typography>
          <Typography variant="subtitle1" fontWeight="bold">
            {formatPlanPrice(plan.priceMinor, plan.currency)}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {formatCreditAllowance(plan.monthlyCreditAllowance)} {messages.creditAllowanceSuffix}
        </Typography>
        <Button
          type="button"
          variant="contained"
          fullWidth
          disabled={isSubmitting}
          onClick={() => onSelect(plan.id)}
        >
          {isSubmitting ? messages.submittingButton : messages.selectButton}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Upgrade/pricing modal (US4, FR-016, SC-006): renders whatever `GET
 * /v1/subscriptions/plans` returns at render time — no hardcoded/fallback
 * plan list, ever, including on loading/error (skeleton/error markup
 * instead, per the domain rule). Selecting a plan starts the mock-Zarinpal
 * checkout redirect flow: `POST /v1/payments/checkout` → full-page
 * navigation to the returned `redirectUrl`.
 *
 * Reads its own open/closed state from `useBillingStore` — `T-097` toggles
 * that store (e.g. from a global 402 interceptor) without this component
 * needing any props wired through a parent.
 */
export function UpgradeModal() {
  const isOpen = useBillingStore((state) => state.isUpgradeModalOpen);
  const closeUpgradeModal = useBillingStore((state) => state.closeUpgradeModal);
  const plansQuery = usePlans();
  const checkoutMutation = useCheckout();
  const messages = getMessages(defaultLocale).billing.upgradeModal;

  const handleSelectPlan = (planId: string) => {
    checkoutMutation.mutate(
      { planId },
      {
        onSuccess: ({ redirectUrl }) => redirectToCheckout(redirectUrl),
      },
    );
  };

  return (
    <Dialog
      open={isOpen}
      onClose={closeUpgradeModal}
      fullWidth
      maxWidth="sm"
      aria-labelledby="upgrade-modal-title"
    >
      <DialogTitle id="upgrade-modal-title">{messages.title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {messages.description}
        </Typography>

        {plansQuery.isLoading && (
          <Stack
            spacing={2}
            alignItems="center"
            role="status"
            aria-live="polite"
            data-testid="upgrade-modal-loading"
            sx={{ py: 4 }}
          >
            <CircularProgress aria-label={messages.loadingLabel} />
            <Typography variant="body2">{messages.loadingLabel}</Typography>
          </Stack>
        )}

        {plansQuery.isError && (
          <Stack spacing={2} data-testid="upgrade-modal-error">
            <Alert severity="error">{messages.errorMessage}</Alert>
            <Button type="button" variant="contained" onClick={() => plansQuery.refetch()}>
              {messages.retryButton}
            </Button>
          </Stack>
        )}

        {plansQuery.isSuccess && plansQuery.data.length === 0 && (
          <Alert severity="info" data-testid="upgrade-modal-empty">
            {messages.emptyMessage}
          </Alert>
        )}

        {plansQuery.isSuccess && plansQuery.data.length > 0 && (
          <Stack spacing={2} data-testid="upgrade-modal-plans">
            {plansQuery.data.map((plan) => (
              <PlanOption
                key={plan.id}
                plan={plan}
                isSubmitting={checkoutMutation.isPending}
                onSelect={handleSelectPlan}
              />
            ))}
          </Stack>
        )}

        {checkoutMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }} data-testid="upgrade-modal-checkout-error">
            {messages.checkoutErrorMessage}
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default UpgradeModal;
