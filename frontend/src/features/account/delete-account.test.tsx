import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/lib/store/auth-store';
import { getMessages, defaultLocale } from '@/i18n';
import { DeleteAccount } from './delete-account';
import { PendingDeletionBanner } from './pending-deletion-banner';

const TEST_ACCESS_TOKEN = 'access-token-account-deletion';
const PURGE_SCHEDULED_FOR = '2026-08-02T00:00:00.000Z';
const messages = getMessages(defaultLocale).accountDeletion;

let requestCallCount = 0;
let cancelCallCount = 0;
let statusCallCount = 0;

const server = setupServer(
  http.get('*/v1/account/deletion', () => {
    statusCallCount += 1;
    return HttpResponse.json({
      deletionStatus: 'active',
      deletionRequestedAt: null,
      purgeScheduledFor: null,
    });
  }),
  http.post('*/v1/account/deletion', () => {
    requestCallCount += 1;
    return HttpResponse.json(
      {
        deletionStatus: 'pending_deletion',
        deletionRequestedAt: '2026-07-26T00:00:00.000Z',
        purgeScheduledFor: PURGE_SCHEDULED_FOR,
      },
      { status: 202 },
    );
  }),
  http.delete('*/v1/account/deletion', () => {
    cancelCallCount += 1;
    return HttpResponse.json({
      deletionStatus: 'active',
      deletionRequestedAt: null,
      purgeScheduledFor: null,
    });
  }),
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
  requestCallCount = 0;
  cancelCallCount = 0;
  statusCallCount = 0;
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
});

afterAll(() => server.close());

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('DeleteAccount', () => {
  it('does not call the deletion endpoint just by opening the confirmation dialog', async () => {
    renderWithClient(<DeleteAccount />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('delete-account-trigger'));

    expect(await screen.findByText(messages.deleteAccount.dialogTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.deleteAccount.dialogBody)).toBeInTheDocument();
    expect(requestCallCount).toBe(0);
  });

  it('closes the dialog without calling the deletion endpoint when cancelled', async () => {
    renderWithClient(<DeleteAccount />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('delete-account-trigger'));
    await screen.findByText(messages.deleteAccount.dialogTitle);

    await user.click(screen.getByTestId('delete-account-cancel-button'));

    await waitFor(() =>
      expect(screen.queryByText(messages.deleteAccount.dialogTitle)).not.toBeInTheDocument(),
    );
    expect(requestCallCount).toBe(0);
  });

  it('calls POST /v1/account/deletion and closes the dialog when the confirm button is clicked', async () => {
    renderWithClient(<DeleteAccount />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('delete-account-trigger'));
    await screen.findByText(messages.deleteAccount.dialogTitle);

    await user.click(screen.getByTestId('delete-account-confirm-button'));

    await waitFor(() => expect(requestCallCount).toBe(1));
    await waitFor(() =>
      expect(screen.queryByText(messages.deleteAccount.dialogTitle)).not.toBeInTheDocument(),
    );
  });

  it('shows an error message and keeps the dialog open when the deletion request fails', async () => {
    server.use(http.post('*/v1/account/deletion', () => HttpResponse.json({}, { status: 500 })));

    renderWithClient(<DeleteAccount />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('delete-account-trigger'));
    await screen.findByText(messages.deleteAccount.dialogTitle);
    await user.click(screen.getByTestId('delete-account-confirm-button'));

    expect(await screen.findByTestId('delete-account-error')).toBeInTheDocument();
    expect(screen.getByText(messages.deleteAccount.dialogTitle)).toBeInTheDocument();
  });
});

describe('PendingDeletionBanner', () => {
  it('renders nothing while the account is active', async () => {
    renderWithClient(<PendingDeletionBanner />);

    await waitFor(() => expect(statusCallCount).toBe(1));
    expect(screen.queryByTestId('pending-deletion-banner')).not.toBeInTheDocument();
  });

  it('shows the purge date and a cancel action while a deletion is pending', async () => {
    server.use(
      http.get('*/v1/account/deletion', () =>
        HttpResponse.json({
          deletionStatus: 'pending_deletion',
          deletionRequestedAt: '2026-07-26T00:00:00.000Z',
          purgeScheduledFor: PURGE_SCHEDULED_FOR,
        }),
      ),
    );

    renderWithClient(<PendingDeletionBanner />);

    expect(await screen.findByTestId('pending-deletion-banner')).toHaveTextContent(
      PURGE_SCHEDULED_FOR,
    );
    expect(screen.getByTestId('pending-deletion-banner-cancel-button')).toBeInTheDocument();
  });

  it('cancelling restores the normal UI immediately — the banner disappears without a page reload', async () => {
    server.use(
      http.get('*/v1/account/deletion', () =>
        HttpResponse.json({
          deletionStatus: 'pending_deletion',
          deletionRequestedAt: '2026-07-26T00:00:00.000Z',
          purgeScheduledFor: PURGE_SCHEDULED_FOR,
        }),
      ),
    );

    renderWithClient(<PendingDeletionBanner />);
    expect(await screen.findByTestId('pending-deletion-banner')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('pending-deletion-banner-cancel-button'));

    await waitFor(() => expect(cancelCallCount).toBe(1));
    await waitFor(() =>
      expect(screen.queryByTestId('pending-deletion-banner')).not.toBeInTheDocument(),
    );
  });

  it('shows an error message and keeps the banner visible when cancelling fails', async () => {
    server.use(
      http.get('*/v1/account/deletion', () =>
        HttpResponse.json({
          deletionStatus: 'pending_deletion',
          deletionRequestedAt: '2026-07-26T00:00:00.000Z',
          purgeScheduledFor: PURGE_SCHEDULED_FOR,
        }),
      ),
      http.delete('*/v1/account/deletion', () => HttpResponse.json({}, { status: 500 })),
    );

    renderWithClient(<PendingDeletionBanner />);
    await screen.findByTestId('pending-deletion-banner');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('pending-deletion-banner-cancel-button'));

    expect(await screen.findByTestId('pending-deletion-banner-error')).toBeInTheDocument();
    expect(screen.getByTestId('pending-deletion-banner')).toBeInTheDocument();
  });
});
