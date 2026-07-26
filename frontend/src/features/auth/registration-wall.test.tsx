import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/lib/store/auth-store';
import { RegistrationWall } from './components/registration-wall';

const server = setupServer(
  http.post('*/v1/auth/register', () =>
    HttpResponse.json({ accessToken: 'access-token-abc', expiresIn: 900 }, { status: 201 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  // Reset the shared auth store between tests so the wall's
  // `justConvertedFromGuest` reaction starts from a clean slate.
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
});

afterEach(() => server.resetHandlers());

afterAll(() => server.close());

function renderWall() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrationWall />
    </QueryClientProvider>,
  );
}

describe('RegistrationWall', () => {
  it('renders only the email/password registration option — no Google/third-party button', () => {
    renderWall();

    expect(screen.getByTestId('registration-wall')).toBeInTheDocument();
    expect(screen.getByTestId('register-form')).toBeInTheDocument();
    expect(screen.getByLabelText('ایمیل')).toBeInTheDocument();
    expect(screen.getByLabelText('رمز عبور')).toBeInTheDocument();

    // FR-007 (v1 scope): no third-party / social sign-in option anywhere in the DOM.
    expect(screen.queryByText(/google/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
  });

  it('offers a link to switch to the login form for a guest who already has an account', async () => {
    const user = userEvent.setup();
    renderWall();

    await user.click(screen.getByRole('button', { name: 'ورود' }));

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.queryByTestId('register-form')).not.toBeInTheDocument();
  });

  it('renders the guest-scans-restored banner after a successful registration from the wall', async () => {
    const user = userEvent.setup();
    renderWall();

    await user.type(screen.getByLabelText('ایمیل'), 'guest-turned-user@example.com');
    await user.type(screen.getByLabelText('رمز عبور'), 'correct-horse-1');
    await user.click(screen.getByRole('button', { name: 'ثبت‌نام' }));

    expect(await screen.findByTestId('guest-scans-restored-banner')).toBeInTheDocument();
    // The wall's forms must be gone, not just hidden behind the banner.
    expect(screen.queryByTestId('register-form')).not.toBeInTheDocument();
  });
});
