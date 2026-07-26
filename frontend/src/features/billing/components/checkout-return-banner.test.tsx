import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBillingStore } from '../store/billing-store';
import { CheckoutReturnBanner } from './checkout-return-banner';

const TEST_ACCESS_TOKEN = 'access-token-checkout-return';

let balanceCallCount = 0;

const server = setupServer(
  http.get('*/v1/credits/balance', () => {
    balanceCallCount += 1;
    return HttpResponse.json({ balance: 300, tier: 'pro' });
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
  balanceCallCount = 0;
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
  useBillingStore.setState({ isUpgradeModalOpen: false, isReturningFromCheckout: false });
});

afterAll(() => server.close());

function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <CheckoutReturnBanner />
    </QueryClientProvider>,
  );
}

describe('CheckoutReturnBanner', () => {
  it('renders nothing while not returning from a checkout redirect', () => {
    useBillingStore.setState({ isReturningFromCheckout: false });

    renderBanner();

    expect(screen.queryByTestId('checkout-return-banner')).not.toBeInTheDocument();
    expect(balanceCallCount).toBe(0);
  });

  it('shows the activating banner, re-fetches the balance from the server, and dismisses itself once resolved — never trusting redirect params', async () => {
    useBillingStore.setState({ isReturningFromCheckout: true });

    renderBanner();

    expect(screen.getByTestId('checkout-return-banner')).toBeInTheDocument();

    await waitFor(() => expect(balanceCallCount).toBe(1));
    await waitFor(() => expect(useBillingStore.getState().isReturningFromCheckout).toBe(false));
    await waitFor(() =>
      expect(screen.queryByTestId('checkout-return-banner')).not.toBeInTheDocument(),
    );
  });

  it('shows an error state with a retry button if the balance re-fetch fails', async () => {
    server.use(http.get('*/v1/credits/balance', () => HttpResponse.json({}, { status: 500 })));
    useBillingStore.setState({ isReturningFromCheckout: true });

    renderBanner();

    expect(await screen.findByTestId('checkout-return-banner-error')).toBeInTheDocument();
    // A failed verification must never silently dismiss the banner.
    expect(useBillingStore.getState().isReturningFromCheckout).toBe(true);
  });
});
