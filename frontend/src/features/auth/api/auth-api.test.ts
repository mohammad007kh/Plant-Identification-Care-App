import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AuthApiError, logout, refresh } from './auth-api';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('refresh', () => {
  it('parses the token response on a 200', async () => {
    server.use(
      http.post('*/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'fresh-token', expiresIn: 900 }, { status: 200 }),
      ),
    );

    await expect(refresh()).resolves.toEqual({ accessToken: 'fresh-token', expiresIn: 900 });
  });

  it('sends no body and includes credentials', async () => {
    let capturedBody = '';
    let capturedCredentials: RequestCredentials | undefined;

    server.use(
      http.post('*/v1/auth/refresh', async ({ request }) => {
        capturedBody = await request.text();
        capturedCredentials = request.credentials;
        return HttpResponse.json({ accessToken: 'fresh-token', expiresIn: 900 }, { status: 200 });
      }),
    );

    await refresh();

    expect(capturedBody).toBe('');
    expect(capturedCredentials).toBe('include');
  });

  it('throws AuthApiError on a 401 (missing/expired cookie)', async () => {
    server.use(
      http.post('*/v1/auth/refresh', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'no refresh cookie' },
          { status: 401 },
        ),
      ),
    );

    await expect(refresh()).rejects.toMatchObject({
      name: 'AuthApiError',
      status: 401,
      detail: 'no refresh cookie',
    });
  });
});

describe('logout', () => {
  it('resolves on a 204 with no JSON body', async () => {
    server.use(http.post('*/v1/auth/logout', () => new HttpResponse(null, { status: 204 })));

    await expect(logout()).resolves.toBeUndefined();
  });

  it('throws AuthApiError on a non-2xx', async () => {
    server.use(http.post('*/v1/auth/logout', () => new HttpResponse(null, { status: 500 })));

    await expect(logout()).rejects.toBeInstanceOf(AuthApiError);
  });
});
