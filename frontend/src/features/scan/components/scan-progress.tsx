import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';

/**
 * In-progress state shown continuously from submission until the scan job
 * reaches a terminal status (US1 Acceptance Scenario 4). `role="status"` +
 * `aria-live="polite"` announce the state to assistive tech without
 * interrupting the user.
 */
export function ScanProgress() {
  const messages = getMessages(defaultLocale).scan.progress;

  return (
    <Stack
      spacing={2}
      alignItems="center"
      role="status"
      aria-live="polite"
      data-testid="scan-progress"
      sx={{ py: 6 }}
    >
      <CircularProgress aria-label={messages.label} />
      <Typography variant="body1">{messages.label}</Typography>
    </Stack>
  );
}

export default ScanProgress;
