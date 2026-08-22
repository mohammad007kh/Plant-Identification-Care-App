import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/lib/store/auth-store';
import { SessionBootstrap } from './session-bootstrap';

let refreshCount = 0;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  refreshCount = 0;
  useAuthStore.setState({
    accessToken: null,
    user: null,
    justConvertedFromGuest: false,
    authStatus: 'unknown',
  });
});

afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('SessionBootstrap', () => {
  it('calls refresh exactly once and marks the session authenticated on success', async () => {
    server.use(
      http.post('*/v1/auth/refresh', () => {
        refreshCount += 1;
        return HttpResponse.json(
          { accessToken: 'rehydrated-token', expiresIn: 900 },
          { status: 200 },
        );
      }),
    );

    render(<SessionBootstrap />);

    await waitFor(() => expect(useAuthStore.getState().authStatus).toBe('authenticated'));
    expect(useAuthStore.getState().accessToken).toBe('rehydrated-token');
    expect(refreshCount).toBe(1);
  });

  it('marks the session guest when the refresh fails', async () => {
    server.use(http.post('*/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })));

    render(<SessionBootstrap />);

    await waitFor(() => expect(useAuthStore.getState().authStatus).toBe('guest'));
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
