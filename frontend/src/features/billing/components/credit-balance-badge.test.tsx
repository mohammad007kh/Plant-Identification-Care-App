import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/lib/store/auth-store';
import { getMessages, defaultLocale } from '@/i18n';
import { formatCreditAllowance } from '../lib/format-price';
import { CreditBalanceBadge } from './credit-balance-badge';

const TEST_ACCESS_TOKEN = 'access-token-badge';
const messages = getMessages(defaultLocale).billing.creditBalanceBadge;

const server = setupServer(
  http.get('*/v1/credits/balance', () => HttpResponse.json({ balance: 250, tier: 'pro' })),
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
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
});

afterAll(() => server.close());

function renderBadge() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <CreditBalanceBadge />
    </QueryClientProvider>,
  );
}

describe('CreditBalanceBadge', () => {
  it('shows a loading state while the balance is being fetched', async () => {
    renderBadge();

    expect(screen.getByTestId('credit-balance-badge-loading')).toBeInTheDocument();
    await screen.findByTestId('credit-balance-badge');
  });

  it('renders the balance and tier once loaded', async () => {
    renderBadge();

    const badge = await screen.findByTestId('credit-balance-badge');
    expect(badge).toHaveTextContent(formatCreditAllowance(250));
    expect(badge).toHaveTextContent(messages.tierLabels.pro);
  });

  it('updates when the mocked balance response changes', async () => {
    server.use(
      http.get('*/v1/credits/balance', () => HttpResponse.json({ balance: 900, tier: 'max' })),
    );

    renderBadge();

    const badge = await screen.findByTestId('credit-balance-badge');
    expect(badge).toHaveTextContent(formatCreditAllowance(900));
    expect(badge).toHaveTextContent(messages.tierLabels.max);
  });

  it('renders a neutral "unavailable" state on fetch failure — never implying zero credits', async () => {
    server.use(http.get('*/v1/credits/balance', () => HttpResponse.json({}, { status: 500 })));

    renderBadge();

    const badge = await screen.findByTestId('credit-balance-badge-error');
    expect(badge).toHaveTextContent(messages.unavailableLabel);
    expect(screen.queryByText('۰')).not.toBeInTheDocument();
  });
});
