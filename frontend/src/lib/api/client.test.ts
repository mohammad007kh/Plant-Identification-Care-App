import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/lib/store/auth-store';
import { ApiClientError, apiClient } from './client';

let refreshCount = 0;

const server = setupServer(
  http.post('*/v1/auth/refresh', async () => {
    refreshCount += 1;
    // Widen the in-flight window so concurrent 401s deterministically dedupe.
    await delay(20);
    return HttpResponse.json({ accessToken: 'fresh-token', expiresIn: 900 }, { status: 200 });
  }),
  http.get('*/v1/protected', ({ request }) => {
    // Only the refreshed token is accepted — the stale one always 401s.
    if (request.headers.get('authorization') === 'Bearer fresh-token') {
      return HttpResponse.json({ ok: true }, { status: 200 });
    }
    return HttpResponse.json({ type: 'about:blank', status: 401 }, { status: 401 });
  }),
);

const originalLocation = window.location;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  refreshCount = 0;
  useAuthStore.setState({
    accessToken: 'stale-token',
    user: null,
    justConvertedFromGuest: false,
    authStatus: 'authenticated',
  });
  // Keep a resolvable href/origin so relative fetches still work; only the
  // `assign` navigation is stubbed (jsdom does not implement it).
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: 'http://localhost/', origin: 'http://localhost', assign: vi.fn() },
  });
});

afterEach(() => {
  server.resetHandlers();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

afterAll(() => server.close());

describe('apiClient', () => {
  it('refreshes once and retries the original request on a 401', async () => {
    const result = await apiClient<{ ok: boolean }>('/v1/protected');

    expect(result).toEqual({ ok: true });
    expect(refreshCount).toBe(1);
    // The refreshed token is written back to the store.
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
  });

  it('dedupes concurrent 401s onto a SINGLE refresh (single-flight)', async () => {
    const results = await Promise.all([
      apiClient<{ ok: boolean }>('/v1/protected'),
      apiClient<{ ok: boolean }>('/v1/protected'),
      apiClient<{ ok: boolean }>('/v1/protected'),
      apiClient<{ ok: boolean }>('/v1/protected'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCount).toBe(1);
  });

  it('clears the session and redirects to /login when the refresh fails', async () => {
    server.use(http.post('*/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })));

    await expect(apiClient('/v1/protected')).rejects.toBeInstanceOf(ApiClientError);

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.authStatus).toBe('guest');
    expect(window.location.assign).toHaveBeenCalledWith('/login');
  });
});
