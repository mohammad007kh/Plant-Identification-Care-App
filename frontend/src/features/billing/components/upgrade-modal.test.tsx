import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Plan } from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import { getMessages, defaultLocale } from '@/i18n';
import { formatPlanPrice } from '../lib/format-price';
import { useBillingStore } from '../store/billing-store';
import { UpgradeModal } from './upgrade-modal';

// Mocked (not spied) so the module's real `window.location.href = url` never
// runs against jsdom's unimplemented navigation — the mutation itself, and
// that this function receives the correct URL, are what this suite verifies.
vi.mock('../lib/redirect-to-checkout', () => ({
  redirectToCheckout: vi.fn(),
}));

// Imported after the `vi.mock` call above (Vitest hoists `vi.mock`, so this
// import resolves to the mocked module regardless of declaration order).
import { redirectToCheckout } from '../lib/redirect-to-checkout';

const TEST_ACCESS_TOKEN = 'access-token-billing';
const REDIRECT_URL = 'https://mock-zarinpal.example/pay/abc123';
const messages = getMessages(defaultLocale).billing.upgradeModal;

function buildPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    key: 'pro',
    monthlyCreditAllowance: 100,
    priceMinor: 49000,
    currency: 'IRR',
    ...overrides,
  };
}

let checkoutCallCount = 0;

const server = setupServer(
  http.get('*/v1/subscriptions/plans', () => HttpResponse.json([buildPlan()])),
  http.post('*/v1/payments/checkout', async () => {
    checkoutCallCount += 1;
    return HttpResponse.json({ redirectUrl: REDIRECT_URL });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  useAuthStore.setState({
    accessToken: TEST_ACCESS_TOKEN,
    user: null,
    justConvertedFromGuest: false,
  });
  useBillingStore.setState({ isUpgradeModalOpen: true, isReturningFromCheckout: false });
});

afterEach(() => {
  server.resetHandlers();
  checkoutCallCount = 0;
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
  useBillingStore.setState({ isUpgradeModalOpen: false, isReturningFromCheckout: false });
  vi.mocked(redirectToCheckout).mockClear();
});

afterAll(() => server.close());

function renderUpgradeModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UpgradeModal />
    </QueryClientProvider>,
  );
}

describe('UpgradeModal', () => {
  it('shows a loading state while the plan catalog is being fetched', async () => {
    renderUpgradeModal();

    expect(screen.getByTestId('upgrade-modal-loading')).toBeInTheDocument();
    await screen.findByTestId('upgrade-modal-plans');
  });

  it('renders whatever the (mocked) plans endpoint returns, and reacts when the mocked response changes — proving no hardcoded plan data', async () => {
    const { unmount } = renderUpgradeModal();

    expect(await screen.findByTestId('upgrade-plan-pro')).toBeInTheDocument();
    expect(screen.getByText(formatPlanPrice(49000, 'IRR'))).toBeInTheDocument();
    unmount();

    server.use(
      http.get('*/v1/subscriptions/plans', () =>
        HttpResponse.json([
          buildPlan({
            id: '22222222-2222-4222-8222-222222222222',
            key: 'max',
            monthlyCreditAllowance: 500,
            priceMinor: 199000,
          }),
        ]),
      ),
    );

    renderUpgradeModal();

    expect(await screen.findByTestId('upgrade-plan-max')).toBeInTheDocument();
    expect(screen.getByText(formatPlanPrice(199000, 'IRR'))).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-plan-pro')).not.toBeInTheDocument();
  });

  it('renders an empty state — never fallback/hardcoded plans — when the catalog is empty', async () => {
    server.use(http.get('*/v1/subscriptions/plans', () => HttpResponse.json([])));

    renderUpgradeModal();

    expect(await screen.findByTestId('upgrade-modal-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-modal-plans')).not.toBeInTheDocument();
  });

  it('renders an error state with a retry button on fetch failure, and retries on click', async () => {
    server.use(http.get('*/v1/subscriptions/plans', () => HttpResponse.json({}, { status: 500 })));

    renderUpgradeModal();

    expect(await screen.findByTestId('upgrade-modal-error')).toBeInTheDocument();

    server.use(http.get('*/v1/subscriptions/plans', () => HttpResponse.json([buildPlan()])));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: messages.retryButton }));

    expect(await screen.findByTestId('upgrade-modal-plans')).toBeInTheDocument();
  });

  it('invokes the checkout mutation and navigates to the returned redirect URL when a plan CTA is clicked', async () => {
    renderUpgradeModal();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: messages.selectButton }));

    await waitFor(() => expect(checkoutCallCount).toBe(1));
    await waitFor(() => expect(redirectToCheckout).toHaveBeenCalledWith(REDIRECT_URL));
  });

  it('shows a checkout error message without navigating when the checkout request fails', async () => {
    server.use(http.post('*/v1/payments/checkout', () => HttpResponse.json({}, { status: 500 })));

    renderUpgradeModal();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: messages.selectButton }));

    expect(await screen.findByTestId('upgrade-modal-checkout-error')).toBeInTheDocument();
    expect(redirectToCheckout).not.toHaveBeenCalled();
  });
});
