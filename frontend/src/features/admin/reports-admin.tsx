'use client';

import type { AdminMisidentificationReport } from 'shared';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAdminMisidentificationReports } from './use-admin';

interface ReportCardProps {
  messages: ReturnType<typeof getMessages>['admin']['reports'];
  report: AdminMisidentificationReport;
}

function ReportCard({ messages, report }: ReportCardProps) {
  const statusLabel =
    report.status === 'open' ? messages.statusLabels.open : messages.statusLabels.reviewed;

  return (
    <Card variant="outlined" data-testid={`reports-admin-report-${report.id}`}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
          <Typography variant="subtitle1" component="h4">
            {messages.scanIdLabel}: {report.scanId}
          </Typography>
          <Typography
            variant="body2"
            fontWeight="bold"
            data-testid={`reports-admin-status-${report.id}`}
          >
            {statusLabel}
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {report.reporterUserId
            ? `${messages.reporterLabel}: ${report.reporterUserId}`
            : messages.guestReporterLabel}
        </Typography>

        {report.note && <Typography variant="body2">{report.note}</Typography>}

        {report.photoUrl ? (
          // Plain `<img>` via MUI's `Box component="img"` (admin-only tool —
          // no need for `next/image`'s optimization pipeline for a signed,
          // one-off report photo URL).
          <Box
            component="img"
            src={report.photoUrl}
            alt={messages.photoAltText}
            data-testid={`reports-admin-photo-${report.id}`}
            sx={{ maxWidth: '100%', mt: 1, borderRadius: 1 }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {messages.noPhotoLabel}
          </Typography>
        )}

        <Typography variant="subtitle2" component="h5" sx={{ mt: 1 }}>
          {messages.aiResultHeading}
        </Typography>
        <Box
          component="pre"
          data-testid={`reports-admin-ai-result-${report.id}`}
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.75rem',
            bgcolor: 'action.hover',
            p: 1,
            borderRadius: 1,
          }}
        >
          {JSON.stringify(report.aiResult, null, 2)}
        </Box>
      </CardContent>
    </Card>
  );
}

/**
 * Misidentification-report review queue (US9, FR-025): each report's
 * reported-scan snapshot (AI result + signed photo URL) for admin triage.
 * Read-only in this task — there is no admin mutation endpoint for reports
 * (`shared/src/contracts/admin.ts`'s own note on `adminMisidentificationReportSchema`).
 */
export function ReportsAdmin() {
  const messages = getMessages(defaultLocale).admin.reports;
  const reportsQuery = useAdminMisidentificationReports();

  const reports: AdminMisidentificationReport[] =
    reportsQuery.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <Stack spacing={3} data-testid="reports-admin">
      <Typography variant="h6" component="h2">
        {messages.heading}
      </Typography>

      {reportsQuery.isLoading && (
        <Stack
          alignItems="center"
          spacing={2}
          role="status"
          aria-live="polite"
          data-testid="reports-admin-loading"
          sx={{ py: 4 }}
        >
          <CircularProgress aria-label={messages.loadingLabel} />
          <Typography variant="body2">{messages.loadingLabel}</Typography>
        </Stack>
      )}

      {reportsQuery.isError && (
        <Stack spacing={2} data-testid="reports-admin-error">
          <Alert severity="error">{messages.errorMessage}</Alert>
          <Button type="button" variant="contained" onClick={() => reportsQuery.refetch()}>
            {messages.retryButton}
          </Button>
        </Stack>
      )}

      {reportsQuery.isSuccess && (
        <Stack spacing={2} data-testid="reports-admin-list">
          {reports.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              data-testid="reports-admin-empty-state"
            >
              {messages.emptyState}
            </Typography>
          ) : (
            reports.map((report) => (
              <ReportCard key={report.id} messages={messages} report={report} />
            ))
          )}

          {reportsQuery.hasNextPage && (
            <Button
              type="button"
              variant="outlined"
              disabled={reportsQuery.isFetchingNextPage}
              onClick={() => reportsQuery.fetchNextPage()}
              data-testid="reports-admin-load-more"
            >
              {reportsQuery.isFetchingNextPage
                ? messages.loadingMoreButton
                : messages.loadMoreButton}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}

export default ReportsAdmin;
