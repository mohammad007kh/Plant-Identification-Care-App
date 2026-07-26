'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';

export interface PlantListEmptyStateProps {
  /**
   * Called when the CTA is activated. Optional: navigating to the scan flow
   * is a route concern (`T-077`), so a caller that hasn't wired routing yet
   * can render this state without a handler — the button simply renders
   * without a click affordance in that case.
   */
  onScanClick?: () => void;
}

/**
 * Empty-state prompt shown by `PlantList` for a new user with zero saved
 * plants (spec Acceptance Scenario US3.3) — a guiding CTA instead of a blank
 * screen (spec Edge Cases).
 */
export function PlantListEmptyState({ onScanClick }: PlantListEmptyStateProps) {
  const messages = getMessages(defaultLocale).plants.list.emptyState;

  return (
    <Stack
      spacing={2}
      alignItems="center"
      data-testid="plant-list-empty-state"
      sx={{ py: 6, textAlign: 'center' }}
    >
      <Typography variant="h6" component="h2">
        {messages.title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {messages.description}
      </Typography>
      <Button type="button" variant="contained" onClick={onScanClick}>
        {messages.ctaButton}
      </Button>
    </Stack>
  );
}
