import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/lib/store/auth-store';
import type { ComparisonScanJob } from '@/lib/api';
import { ComparisonPanel } from './comparison-panel';

const TEST_ACCESS_TOKEN = 'access-token-abc';
const PLANT_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '22222222-2222-4222-8222-222222222222';
const PREVIOUS_PHOTO_ID = '33333333-3333-4333-8333-333333333333';
const NEW_PHOTO_ID = '44444444-4444-4444-8444-444444444444';

const PENDING_JOB: ComparisonScanJob = {
  id: SCAN_ID,
  type: 'comparison',
  status: 'pending',
  confidence: null,
  species: null,
  careGuide: null,
  lowConfidence: false,
  message: null,
};

function buildVerdictJob(): ComparisonScanJob {
  return {
    ...PENDING_JOB,
    status: 'completed',
    result: {
      verdict: 'improved',
      referencedPhotoIds: [PREVIOUS_PHOTO_ID, NEW_PHOTO_ID],
    },
  };
}

function buildFollowUpNeededJob(): ComparisonScanJob {
  return {
    ...PENDING_JOB,
    status: 'completed',
    message: 'برای مقایسه روند سلامت، به حداقل یک عکس پیگیری دیگر نیاز است.',
  };
}

function buildFailedJob(): ComparisonScanJob {
  return {
    ...PENDING_JOB,
    status: 'failed',
    message: 'مقایسه سلامت گیاه با خطا مواجه شد. اعتبار شما بازگردانده شد؛ لطفاً دوباره تلاش کنید.',
  };
}

function makeImageFile(name = 'follow-up.png'): File {
  return new File(['fake-image-bytes'], name, { type: 'image/png' });
}

let submitCallCount = 0;

const server = setupServer(
  http.post(`*/v1/plants/${PLANT_ID}/photos`, async () => {
    submitCallCount += 1;
    return HttpResponse.json(PENDING_JOB, { status: 202 });
  }),
  http.get(`*/v1/scans/${SCAN_ID}`, () => HttpResponse.json(PENDING_JOB)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  useAuthStore.setState({
    accessToken: TEST_ACCESS_TOKEN,
    user: null,
    justConvertedFromGuest: false,
  });
});

afterEach(() => {
  server.resetHandlers();
  submitCallCount = 0;
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
});

afterAll(() => server.close());

function renderComparisonPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ComparisonPanel plantId={PLANT_ID} />
    </QueryClientProvider>,
  );
}

async function uploadAndSubmit(photo: File = makeImageFile()) {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('انتخاب عکس پیگیری'), photo);
  await user.click(screen.getByRole('button', { name: 'ثبت عکس پیگیری' }));
}

describe('ComparisonPanel', () => {
  it('renders the follow-up upload form by default', () => {
    renderComparisonPanel();

    expect(screen.getByTestId('comparison-upload-form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت عکس پیگیری' })).toBeDisabled();
  });

  it('shows the in-progress state after submitting a follow-up photo', async () => {
    renderComparisonPanel();
    await uploadAndSubmit();

    expect(await screen.findByTestId('comparison-progress')).toBeInTheDocument();
    expect(submitCallCount).toBe(1);
  });

  it('renders the verdict and both referenced photos on a completed comparison', async () => {
    server.use(http.get(`*/v1/scans/${SCAN_ID}`, () => HttpResponse.json(buildVerdictJob())));

    renderComparisonPanel();
    await uploadAndSubmit();

    expect(await screen.findByTestId('comparison-result')).toBeInTheDocument();
    expect(screen.getByText('بهبود یافته')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-photo-previous')).toHaveTextContent(PREVIOUS_PHOTO_ID);
    expect(screen.getByTestId('comparison-photo-new')).toHaveTextContent(NEW_PHOTO_ID);

    // The other terminal-state markup must be entirely absent from the DOM.
    expect(screen.queryByTestId('comparison-follow-up-needed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('comparison-failed')).not.toBeInTheDocument();
  });

  it('renders the follow-up-needed guidance instead of a verdict when fewer than two photos are on file', async () => {
    server.use(
      http.get(`*/v1/scans/${SCAN_ID}`, () => HttpResponse.json(buildFollowUpNeededJob())),
    );

    renderComparisonPanel();
    await uploadAndSubmit();

    expect(await screen.findByTestId('comparison-follow-up-needed')).toBeInTheDocument();
    expect(
      screen.getByText('برای مقایسه روند سلامت، به حداقل یک عکس پیگیری دیگر نیاز است.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('comparison-result')).not.toBeInTheDocument();
  });

  it('renders a retry prompt when the comparison job fails, and returns to the upload form on retry', async () => {
    server.use(http.get(`*/v1/scans/${SCAN_ID}`, () => HttpResponse.json(buildFailedJob())));

    renderComparisonPanel();
    await uploadAndSubmit();

    expect(await screen.findByTestId('comparison-failed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'مقایسه سلامت گیاه با خطا مواجه شد. اعتبار شما بازگردانده شد؛ لطفاً دوباره تلاش کنید.',
      ),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    expect(await screen.findByTestId('comparison-upload-form')).toBeInTheDocument();
  });

  it('rejects a non-image file client-side without calling the API', async () => {
    renderComparisonPanel();

    // `accept="image/*"` already filters the native file input (browsers,
    // and `userEvent.upload` simulating them, refuse to even select a
    // mismatched file there — see the same note in `scan-flow.test.tsx`), so
    // `fireEvent.change` is used here to bypass that and exercise the
    // client-side MIME check itself (defense in depth; the backend upload
    // pipe remains the server-side source of truth).
    const textFile = new File(['not an image'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('انتخاب عکس پیگیری'), { target: { files: [textFile] } });

    expect(
      await screen.findByText(
        'فقط فایل‌های تصویری (عکس) پذیرفته می‌شوند. لطفاً یک عکس انتخاب کنید.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت عکس پیگیری' })).toBeDisabled();
    expect(submitCallCount).toBe(0);
  });
});
