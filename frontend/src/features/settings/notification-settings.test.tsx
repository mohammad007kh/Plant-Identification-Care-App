import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/lib/store/auth-store';
import { getMessages, defaultLocale } from '@/i18n';
import { NotificationSettings } from './notification-settings';

const TEST_ACCESS_TOKEN = 'access-token-notification-settings';
const messages = getMessages(defaultLocale).notificationPrefs;

let patchCallCount = 0;
let lastPatchBody: unknown = null;

const server = setupServer(
  http.get('*/v1/account/notifications', () =>
    HttpResponse.json({ notifEmailEnabled: true, notifPushEnabled: false }),
  ),
  http.patch('*/v1/account/notifications', async ({ request }) => {
    patchCallCount += 1;
    lastPatchBody = await request.json();
    return HttpResponse.json({
      notifEmailEnabled: true,
      notifPushEnabled: false,
      ...(lastPatchBody as Record<string, boolean>),
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
  patchCallCount = 0;
  lastPatchBody = null;
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
});

afterAll(() => server.close());

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationSettings />
    </QueryClientProvider>,
  );
}

describe('NotificationSettings', () => {
  it('renders the loaded email/push preferences', async () => {
    renderSettings();

    const emailToggle = await screen.findByRole('checkbox', { name: messages.emailToggleLabel });
    const pushToggle = screen.getByRole('checkbox', { name: messages.pushToggleLabel });

    expect(emailToggle).toBeChecked();
    expect(pushToggle).not.toBeChecked();
  });

  it('toggling the email switch calls PATCH and persists the new (unchecked) state', async () => {
    renderSettings();

    const emailToggle = await screen.findByRole('checkbox', { name: messages.emailToggleLabel });
    expect(emailToggle).toBeChecked();

    const user = userEvent.setup();
    await user.click(emailToggle);

    await waitFor(() => expect(patchCallCount).toBe(1));
    expect(lastPatchBody).toEqual({ notifEmailEnabled: false });
    await waitFor(() => expect(emailToggle).not.toBeChecked());
  });

  it('rolls back the toggle and shows an error message when the PATCH request fails', async () => {
    server.use(
      http.patch('*/v1/account/notifications', () => HttpResponse.json({}, { status: 500 })),
    );

    renderSettings();

    const emailToggle = await screen.findByRole('checkbox', { name: messages.emailToggleLabel });
    const user = userEvent.setup();
    await user.click(emailToggle);

    expect(await screen.findByTestId('notification-settings-update-error')).toBeInTheDocument();
    await waitFor(() => expect(emailToggle).toBeChecked());
  });

  it('degrades to email-only when browser push is unavailable in this environment (jsdom)', async () => {
    renderSettings();

    // jsdom has no Notification/serviceWorker/PushManager globals, so
    // isPushSupported() resolves to false — the panel must show the
    // unavailable notice, hide the enable-push action, and still let the
    // email toggle work.
    await screen.findByRole('checkbox', { name: messages.emailToggleLabel });

    expect(await screen.findByTestId('notification-settings-push-unsupported')).toBeInTheDocument();
    expect(
      screen.queryByTestId('notification-settings-enable-push-button'),
    ).not.toBeInTheDocument();

    const emailToggle = screen.getByRole('checkbox', { name: messages.emailToggleLabel });
    const user = userEvent.setup();
    await user.click(emailToggle);

    await waitFor(() => expect(patchCallCount).toBe(1));
  });

  it('shows a load error when GET /v1/account/notifications fails', async () => {
    server.use(
      http.get('*/v1/account/notifications', () => HttpResponse.json({}, { status: 500 })),
    );

    renderSettings();

    expect(await screen.findByTestId('notification-settings-error')).toBeInTheDocument();
  });
});
