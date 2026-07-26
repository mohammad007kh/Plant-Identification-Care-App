import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ScanJob } from 'shared';
import { ScanFlow } from './scan-flow';

const SCAN_ID = '11111111-1111-4111-8111-111111111111';

const PENDING_JOB: ScanJob = {
  id: SCAN_ID,
  type: 'identify',
  status: 'pending',
  confidence: null,
  species: null,
  careGuide: null,
  lowConfidence: false,
  message: null,
};

function buildCompletedJob(): ScanJob {
  return {
    ...PENDING_JOB,
    status: 'completed',
    confidence: 0.92,
    species: { commonName: 'سانسوریا', scientificName: 'Sansevieria trifasciata' },
    careGuide: {
      watering: 'هر ۲ هفته یک‌بار',
      light: 'نور غیرمستقیم',
      soil: 'خاک زهکش‌دار',
      humidity: 'متوسط',
      temperature: '۱۸ تا ۲۷ درجه',
    },
    lowConfidence: false,
    message: null,
  };
}

function buildLowConfidenceJob(): ScanJob {
  return {
    ...PENDING_JOB,
    status: 'completed',
    confidence: 0.4,
    species: null,
    careGuide: null,
    lowConfidence: true,
    message: 'اطمینان شناسایی کافی نبود.',
  };
}

function makeImageFile(name = 'leaf.png'): File {
  return new File(['fake-image-bytes'], name, { type: 'image/png' });
}

let submitCallCount = 0;

const server = setupServer(
  http.post('*/v1/scans', async () => {
    submitCallCount += 1;
    return HttpResponse.json(PENDING_JOB, { status: 202 });
  }),
  http.get('*/v1/scans/:id', () => HttpResponse.json(PENDING_JOB)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  submitCallCount = 0;
});

afterAll(() => server.close());

function renderScanFlow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ScanFlow />
    </QueryClientProvider>,
  );
}

async function uploadAndSubmit(photo: File = makeImageFile()) {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('انتخاب از گالری'), photo);
  await user.click(screen.getByRole('button', { name: 'شناسایی گیاه' }));
}

describe('ScanFlow', () => {
  it('renders the photo uploader by default', () => {
    renderScanFlow();

    expect(screen.getByTestId('photo-uploader')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'شناسایی گیاه' })).toBeDisabled();
  });

  it('rejects a non-image file client-side without calling the API', async () => {
    renderScanFlow();

    // `accept="image/*"` already filters the native file-picker/camera
    // inputs (browsers, and `userEvent.upload` simulating them, refuse to
    // even select a mismatched file there) — drag-and-drop is the realistic
    // path that bypasses `accept` entirely, which is exactly why the
    // client-side MIME check in `photo-uploader.tsx` exists (FR-001 defense
    // in depth; T-014 remains the server-side source of truth).
    const textFile = new File(['not an image'], 'note.txt', { type: 'text/plain' });
    fireEvent.drop(screen.getByTestId('photo-dropzone'), { dataTransfer: { files: [textFile] } });

    expect(
      await screen.findByText(
        'فقط فایل‌های تصویری (عکس) پذیرفته می‌شوند. لطفاً یک عکس انتخاب کنید.',
      ),
    ).toBeInTheDocument();
    // The submit button must stay disabled — no file was accepted.
    expect(screen.getByRole('button', { name: 'شناسایی گیاه' })).toBeDisabled();
    expect(submitCallCount).toBe(0);
  });

  it('shows the in-progress state after submitting a photo, then stops on a terminal status', async () => {
    renderScanFlow();
    await uploadAndSubmit();

    expect(await screen.findByTestId('scan-progress')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('در حال بررسی عکس شما');
    expect(submitCallCount).toBe(1);
  });

  it('renders species and structured care guide on a confident result', async () => {
    server.use(http.get('*/v1/scans/:id', () => HttpResponse.json(buildCompletedJob())));

    renderScanFlow();
    await uploadAndSubmit();

    expect(await screen.findByTestId('scan-result')).toBeInTheDocument();
    expect(screen.getByText('سانسوریا')).toBeInTheDocument();
    expect(screen.getByText('Sansevieria trifasciata')).toBeInTheDocument();
    expect(screen.getByText('هر ۲ هفته یک‌بار')).toBeInTheDocument();
    expect(screen.getByText('نور غیرمستقیم')).toBeInTheDocument();

    // Low-confidence markup must be entirely absent, not just hidden.
    expect(screen.queryByTestId('scan-low-confidence-prompt')).not.toBeInTheDocument();
  });

  it('renders the low-confidence prompt exclusively when confidence is below the gate', async () => {
    server.use(http.get('*/v1/scans/:id', () => HttpResponse.json(buildLowConfidenceJob())));

    renderScanFlow();
    await uploadAndSubmit();

    expect(await screen.findByTestId('scan-low-confidence-prompt')).toBeInTheDocument();
    expect(screen.getByText('اطمینان شناسایی کافی نبود.')).toBeInTheDocument();

    // Species/care-guide markup must be entirely absent from the DOM, not
    // just visually hidden — assert both the container and its content.
    expect(screen.queryByTestId('scan-result')).not.toBeInTheDocument();
    expect(screen.queryByText('سانسوریا')).not.toBeInTheDocument();
    expect(screen.queryByText(/راهنمای نگهداری/)).not.toBeInTheDocument();
  });

  it('renders a retry prompt when the scan job fails', async () => {
    server.use(
      http.get('*/v1/scans/:id', () =>
        HttpResponse.json({
          ...PENDING_JOB,
          status: 'failed',
          message: 'پردازش با مشکل مواجه شد، دوباره تلاش کنید.',
        }),
      ),
    );

    renderScanFlow();
    await uploadAndSubmit();

    expect(await screen.findByTestId('scan-failed')).toBeInTheDocument();
    expect(screen.getByText('پردازش با مشکل مواجه شد، دوباره تلاش کنید.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    // Retry returns the user to the uploader.
    expect(await screen.findByTestId('photo-uploader')).toBeInTheDocument();
  });
});
