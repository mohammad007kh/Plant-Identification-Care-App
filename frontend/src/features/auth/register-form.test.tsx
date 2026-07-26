import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { RegisterForm } from './components/register-form';

let capturedBody: unknown = null;
let registerCallCount = 0;

const server = setupServer(
  http.post('*/v1/auth/register', async ({ request }) => {
    registerCallCount += 1;
    capturedBody = await request.json();
    return HttpResponse.json({ accessToken: 'access-token-abc', expiresIn: 900 }, { status: 201 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  registerCallCount = 0;
  capturedBody = null;
});

afterAll(() => server.close());

function renderRegisterForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterForm />
    </QueryClientProvider>,
  );
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('ایمیل'), email);
  await user.type(screen.getByLabelText('رمز عبور'), password);
  await user.click(screen.getByRole('button', { name: 'ثبت‌نام' }));
  return user;
}

describe('RegisterForm', () => {
  it('calls the register API with the right payload on a valid submit', async () => {
    renderRegisterForm();

    await fillAndSubmit('new-user@example.com', 'correct-horse-1');

    await waitFor(() => expect(registerCallCount).toBe(1));
    expect(capturedBody).toEqual({ email: 'new-user@example.com', password: 'correct-horse-1' });
  });

  it('shows a field error for an invalid email without calling the API', async () => {
    renderRegisterForm();

    await fillAndSubmit('not-an-email', 'correct-horse-1');

    expect(await screen.findByText('لطفاً یک ایمیل معتبر وارد کنید.')).toBeInTheDocument();
    expect(registerCallCount).toBe(0);
  });

  it('shows a field error for a weak password without calling the API', async () => {
    renderRegisterForm();

    await fillAndSubmit('new-user@example.com', 'short');

    expect(await screen.findByText('رمز عبور باید حداقل ۸ کاراکتر باشد')).toBeInTheDocument();
    expect(registerCallCount).toBe(0);
  });

  it('renders the "email already registered" banner on a 409 response', async () => {
    server.use(
      http.post('*/v1/auth/register', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'duplicate email' },
          { status: 409 },
        ),
      ),
    );

    renderRegisterForm();
    await fillAndSubmit('existing-user@example.com', 'correct-horse-1');

    expect(await screen.findByTestId('register-form-error')).toHaveTextContent(
      'این ایمیل قبلاً ثبت شده است.',
    );
  });
});
