import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';

export interface ScanLowConfidencePromptProps {
  /** Server-provided prompt (FR-003); falls back to a generic Persian message. */
  message?: string | null;
  onRetry: () => void;
}

/**
 * FR-003: when AI confidence is below 70%, this is rendered INSTEAD of any
 * species/care-guide markup — never alongside it (see `scan-result.tsx`,
 * which returns this early and never mounts the confident-result markup).
 */
export function ScanLowConfidencePrompt({ message, onRetry }: ScanLowConfidencePromptProps) {
  const messages = getMessages(defaultLocale).scan.lowConfidence;

  return (
    <Stack spacing={2} data-testid="scan-low-confidence-prompt">
      <Alert severity="warning">{message ?? messages.defaultMessage}</Alert>
      <Typography variant="body2" color="text.secondary">
        {messages.hint}
      </Typography>
      <Button type="button" variant="contained" onClick={onRetry}>
        {messages.retryButton}
      </Button>
    </Stack>
  );
}

export default ScanLowConfidencePrompt;
