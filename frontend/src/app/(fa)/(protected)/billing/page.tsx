'use client';

import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { CreditBalanceBadge, useBillingStore } from '@/features/billing';

/**
 * Billing route (US4): current credit balance/tier + an entry point into the
 * plans list. `UpgradeModal` itself is mounted globally (`app/providers.tsx`)
 * since it's driven entirely by `useBillingStore`'s `isUpgradeModalOpen` flag
 * (per the `billing` barrel's own doc comment) — this page only needs to
 * flip that flag on, which is why it's a client component.
 */
export default function BillingPage() {
  const messages = getMessages(defaultLocale).billingPage;
  const openUpgradeModal = useBillingStore((state) => state.openUpgradeModal);

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 8 }}>
      <Stack spacing={3} alignItems="flex-start">
        <Typography variant="h5" component="h1">
          {messages.heading}
        </Typography>
        <CreditBalanceBadge />
        <Button
          type="button"
          variant="contained"
          onClick={openUpgradeModal}
          data-testid="billing-open-upgrade-modal"
        >
          {messages.upgradeButton}
        </Button>
      </Stack>
    </Container>
  );
}
