'use client';

import { useCallback, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { defaultLocale, getMessages } from '@/i18n';
import { ScanApiError } from './api/scans-api';
import { PhotoUploader } from './components/photo-uploader';
import { ScanProgress } from './components/scan-progress';
import { ScanResult } from './components/scan-result';
import { getScanSubmitErrorMessage, useCreateScan } from './hooks/use-create-scan';
import { useScanStatus } from './hooks/use-scan-status';

/** T-021's server-authoritative guest-scan-limit guard responds with this status. */
const GUEST_LIMIT_STATUS = 403;

/**
 * Orchestrates the visitor-facing scan experience: upload → poll → result.
 * No login required (guest flow) — `scanId` is local component state, which
 * is all this task needs (`ScanFlow` isn't reachable from any route until
 * T-037 wires it in, so surviving a route change isn't yet a requirement).
 *
 * Assumes a TanStack Query `QueryClientProvider` ancestor (supplied by the
 * app shell when this is wired in — see tests for the standalone pattern).
 */
export function ScanFlow() {
  const messages = getMessages(defaultLocale).scan.failed;
  const [scanId, setScanId] = useState<string | null>(null);

  const createScan = useCreateScan();
  const scanStatus = useScanStatus(scanId);

  const handleSubmit = useCallback(
    (photo: File) => {
      createScan.mutate(photo, {
        onSuccess: (job) => setScanId(job.id),
      });
    },
    [createScan],
  );

  const handleRetry = useCallback(() => {
    setScanId(null);
    createScan.reset();
  }, [createScan]);

  if (scanId === null) {
    const isGuestLimitExceeded =
      createScan.isError &&
      createScan.error instanceof ScanApiError &&
      createScan.error.status === GUEST_LIMIT_STATUS;

    return (
      <PhotoUploader
        onSubmit={handleSubmit}
        isSubmitting={createScan.isPending}
        submitError={createScan.isError ? getScanSubmitErrorMessage(createScan.error) : null}
        isGuestLimitExceeded={isGuestLimitExceeded}
      />
    );
  }

  if (scanStatus.isError) {
    return (
      <Stack spacing={2} data-testid="scan-failed">
        <Alert severity="error">{messages.pollErrorMessage}</Alert>
        <Button type="button" variant="contained" onClick={handleRetry}>
          {messages.retryButton}
        </Button>
      </Stack>
    );
  }

  const job = scanStatus.data;

  if (!job || job.status === 'pending') {
    return <ScanProgress />;
  }

  if (job.status === 'failed') {
    return (
      <Stack spacing={2} data-testid="scan-failed">
        <Alert severity="error">{job.message ?? messages.defaultMessage}</Alert>
        <Button type="button" variant="contained" onClick={handleRetry}>
          {messages.retryButton}
        </Button>
      </Stack>
    );
  }

  return <ScanResult job={job} onRetry={handleRetry} />;
}

export default ScanFlow;
