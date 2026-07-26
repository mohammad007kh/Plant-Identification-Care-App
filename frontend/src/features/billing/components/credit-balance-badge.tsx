'use client';

import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { defaultLocale, getMessages } from '@/i18n';
import { useCreditBalance } from '../hooks/use-credit-balance';
import { formatCreditAllowance } from '../lib/format-price';

/**
 * Small "current credit balance + tier" display (US4, FR-016), used
 * throughout the app once mounted by `T-097`. Shows a loading skeleton while
 * fetching, and — critically — a neutral "unavailable" fallback on error
 * rather than any number: a transient fetch failure must never visually
 * read as "zero credits" when the true balance is simply unknown.
 */
export function CreditBalanceBadge() {
  const messages = getMessages(defaultLocale).billing.creditBalanceBadge;
  const balanceQuery = useCreditBalance();

  if (balanceQuery.isLoading) {
    return (
      <Chip
        data-testid="credit-balance-badge-loading"
        icon={<CircularProgress size={14} aria-hidden="true" />}
        label={messages.loadingLabel}
        variant="outlined"
        aria-label={messages.loadingLabel}
      />
    );
  }

  if (balanceQuery.isError || !balanceQuery.data) {
    return (
      <Chip
        data-testid="credit-balance-badge-error"
        label={messages.unavailableLabel}
        variant="outlined"
      />
    );
  }

  const { balance, tier } = balanceQuery.data;
  const tierLabel = messages.tierLabels[tier] ?? tier;

  return (
    <Chip
      data-testid="credit-balance-badge"
      color="primary"
      label={`${formatCreditAllowance(balance)} ${messages.creditsSuffix} · ${tierLabel}`}
    />
  );
}

export default CreditBalanceBadge;
