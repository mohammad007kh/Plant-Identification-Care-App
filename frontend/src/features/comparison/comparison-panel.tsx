'use client';

import { useCallback, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { HealthVerdict } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { useComparison } from './use-comparison';

export interface ComparisonPanelProps {
  /** Opaque `public_id` of the plant to submit a follow-up photo against. */
  plantId: string;
}

/** Same "visually hidden but still in the a11y tree" trick as the scan feature's `PhotoUploader`. */
const visuallyHiddenInputStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Up/down/flat trend indicators (US5, FR-011). These are vertical
 * indicators — not directional left/right arrows like `ChevronLeft` — so no
 * RTL mirroring is needed here, unlike a "back"/"forward" chevron would.
 */
const VERDICT_STYLE: Record<
  HealthVerdict,
  { symbol: string; color: 'success.main' | 'error.main' | 'text.secondary' }
> = {
  improved: { symbol: '▲', color: 'success.main' },
  worse: { symbol: '▼', color: 'error.main' },
  unchanged: { symbol: '—', color: 'text.secondary' },
};

interface FollowUpUploadFormProps {
  onSubmit: (photo: File) => void;
  isSubmitting: boolean;
  submitErrorMessage: string | null;
}

/**
 * Minimal follow-up-photo picker, mirroring the sibling `scan` feature's
 * `PhotoUploader` UX (gallery/camera file input + client-side image-type
 * check before any network call) at the smaller scope this task calls for
 * (`verify-depth: light`) — kept inline rather than as a shared component
 * since this panel is its only consumer today.
 */
function FollowUpUploadForm({
  onSubmit,
  isSubmitting,
  submitErrorMessage,
}: FollowUpUploadFormProps) {
  const messages = getMessages(defaultLocale).comparison.upload;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so re-selecting the same file still fires `onChange` next time.
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setValidationError(messages.errors.notAnImage);
      setSelectedFile(null);
      return;
    }

    setValidationError(null);
    setSelectedFile(file);
  };

  const handleSubmit = () => {
    if (selectedFile) {
      onSubmit(selectedFile);
    }
  };

  return (
    <Stack spacing={2} data-testid="comparison-upload-form">
      <Typography variant="body2" color="text.secondary">
        {messages.hint}
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center">
        <Button type="button" variant="outlined" onClick={() => inputRef.current?.click()}>
          {messages.chooseFileButton}
        </Button>
        {selectedFile && <Typography variant="body2">{selectedFile.name}</Typography>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          aria-label={messages.chooseFileButton}
          style={visuallyHiddenInputStyle}
        />
      </Stack>

      {validationError && <Alert severity="error">{validationError}</Alert>}
      {submitErrorMessage && <Alert severity="error">{submitErrorMessage}</Alert>}

      <Button
        type="button"
        variant="contained"
        disabled={!selectedFile || isSubmitting}
        onClick={handleSubmit}
        sx={{ alignSelf: 'flex-start' }}
      >
        {isSubmitting ? messages.submittingButton : messages.submitButton}
      </Button>
    </Stack>
  );
}

/**
 * US5 (FR-011): follow-up-photo submission + health-trend verdict display,
 * mounted inside `PlantDetail`. States, in order: upload form → in-progress
 * (poll) → terminal result — either a computed verdict (with the two
 * referenced photos), the "follow-up needed" guidance (fewer than two
 * photos on file), or a failure + retry prompt (FR-030: credit is refunded
 * server-side on failure — see `comparison.service.ts` — so the retry
 * prompt never implies a phantom credit loss).
 */
export function ComparisonPanel({ plantId }: ComparisonPanelProps) {
  const messages = getMessages(defaultLocale).comparison;
  const comparison = useComparison(plantId);

  const handleSubmit = useCallback((photo: File) => comparison.submit(photo), [comparison]);

  return (
    <Stack spacing={2} data-testid="comparison-panel">
      <Typography variant="subtitle1" component="h3">
        {messages.panel.heading}
      </Typography>

      <ComparisonPanelBody comparison={comparison} messages={messages} onSubmit={handleSubmit} />
    </Stack>
  );
}

interface ComparisonPanelBodyProps {
  comparison: ReturnType<typeof useComparison>;
  messages: ReturnType<typeof getMessages>['comparison'];
  onSubmit: (photo: File) => void;
}

/**
 * Renders whichever of the panel's states currently applies. Split out from
 * `ComparisonPanel` itself only so each state's early return stays a plain,
 * top-level `if` — no dead code after a `return` in the outer component.
 */
function ComparisonPanelBody({ comparison, messages, onSubmit }: ComparisonPanelBodyProps) {
  if (comparison.scanId === null) {
    return (
      <FollowUpUploadForm
        onSubmit={onSubmit}
        isSubmitting={comparison.isSubmitting}
        submitErrorMessage={comparison.submitError ? comparison.submitError.mapped.message : null}
      />
    );
  }

  if (comparison.status.isError) {
    return (
      <Stack spacing={2} data-testid="comparison-failed">
        <Alert severity="error">{comparison.status.error.mapped.message}</Alert>
        <Button
          type="button"
          variant="contained"
          onClick={comparison.reset}
          sx={{ alignSelf: 'flex-start' }}
        >
          {messages.failed.retryButton}
        </Button>
      </Stack>
    );
  }

  const job = comparison.status.data;

  if (!job || job.status === 'pending') {
    return (
      <Stack
        spacing={2}
        alignItems="center"
        role="status"
        aria-live="polite"
        data-testid="comparison-progress"
        sx={{ py: 4 }}
      >
        <CircularProgress aria-label={messages.progress.label} />
        <Typography variant="body2">{messages.progress.label}</Typography>
      </Stack>
    );
  }

  if (job.status === 'failed') {
    return (
      <Stack spacing={2} data-testid="comparison-failed">
        <Alert severity="error">{job.message ?? messages.failed.defaultMessage}</Alert>
        <Button
          type="button"
          variant="contained"
          onClick={comparison.reset}
          sx={{ alignSelf: 'flex-start' }}
        >
          {messages.failed.retryButton}
        </Button>
      </Stack>
    );
  }

  if (!job.result) {
    // FR-011: fewer than two photos on file — no verdict was computed.
    return (
      <Stack spacing={2} data-testid="comparison-follow-up-needed">
        <Alert severity="info">{job.message ?? messages.followUpNeeded.defaultMessage}</Alert>
        <Button
          type="button"
          variant="outlined"
          onClick={comparison.reset}
          sx={{ alignSelf: 'flex-start' }}
        >
          {messages.followUpNeeded.addAnotherButton}
        </Button>
      </Stack>
    );
  }

  const { verdict, referencedPhotoIds } = job.result;
  const verdictStyle = VERDICT_STYLE[verdict];
  const [previousPhotoId, newPhotoId] = referencedPhotoIds;

  return (
    <Stack spacing={2} data-testid="comparison-result">
      <Typography variant="subtitle2" color="text.secondary">
        {messages.result.heading}
      </Typography>

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography component="span" sx={{ color: verdictStyle.color }} aria-hidden="true">
          {verdictStyle.symbol}
        </Typography>
        <Typography variant="h6" component="p" sx={{ color: verdictStyle.color }}>
          {messages.result.verdicts[verdict]}
        </Typography>
      </Stack>

      <Divider />

      <Stack direction="row" spacing={3}>
        <Box data-testid="comparison-photo-previous">
          <Typography variant="caption" color="text.secondary" component="p">
            {messages.result.previousPhotoLabel}
          </Typography>
          <Typography variant="body2">{previousPhotoId}</Typography>
        </Box>
        <Box data-testid="comparison-photo-new">
          <Typography variant="caption" color="text.secondary" component="p">
            {messages.result.newPhotoLabel}
          </Typography>
          <Typography variant="body2">{newPhotoId}</Typography>
        </Box>
      </Stack>

      <Button
        type="button"
        variant="outlined"
        onClick={comparison.reset}
        sx={{ alignSelf: 'flex-start' }}
      >
        {messages.result.addAnotherButton}
      </Button>
    </Stack>
  );
}

export default ComparisonPanel;
