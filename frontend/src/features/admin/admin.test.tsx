import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type {
  AdminConfig,
  AdminMisidentificationReport,
  AdminSpecies,
  AdminTier,
  AdminUserSummary,
} from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import AdminLayout from '../../app/(fa)/admin/layout';

// A STABLE router object (not a fresh literal per call) — matches real
// Next.js App Router behavior, where `useRouter()` returns the same instance
// across re-renders. A fresh-object-per-call mock would make `AdminLayout`'s
// `useEffect(..., [isAdmin, router])` re-run on every render (not just when
// `isAdmin` changes), which both misrepresents production behavior and made
// an earlier version of this suite flaky across test boundaries.
const { routerReplaceMock, routerMock } = vi.hoisted(() => {
  const replaceMock = vi.fn();
  return {
    routerReplaceMock: replaceMock,
    routerMock: { replace: replaceMock, push: vi.fn(), back: vi.fn(), forward: vi.fn() },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

/** Unverified test JWT — mirrors `get-role-from-token.ts`'s decode-only contract (no signature is ever checked client-side). */
function buildAccessToken(role: string): string {
  const base64UrlEncode = (payload: object): string =>
    Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const header = base64UrlEncode({ alg: 'none', typ: 'JWT' });
  const payload = base64UrlEncode({ sub: 'admin-public-id', role, typ: 'access' });
  return `${header}.${payload}.signature`;
}

const ADMIN_TOKEN = buildAccessToken('admin');
const NON_ADMIN_TOKEN = buildAccessToken('user');

function buildSpecies(overrides: Partial<AdminSpecies> = {}): AdminSpecies {
  return {
    publicId: '11111111-1111-4111-8111-111111111111',
    scientificName: 'Sansevieria trifasciata',
    commonNameFa: 'سانسوریا',
    careGuide: { watering: 'هفته‌ای یک‌بار' },
    ...overrides,
  };
}

function buildConfig(overrides: Partial<AdminConfig> = {}): AdminConfig {
  return {
    allowedPhotoFileTypes: ['image/jpeg', 'image/png'],
    creditCosts: { identify: 1, chat: 1, comparison: 2 },
    notification: {
      templates: {
        watering: { subject: 'یادآوری آبیاری', bodyFa: 'وقت آبیاری گیاه شماست.' },
        custom: { subject: 'اعلان', bodyFa: 'پیام سفارشی' },
      },
      sendHourLocalTehran: 9,
    },
    ...overrides,
  };
}

function buildTiers(): AdminTier[] {
  return [
    {
      publicId: '66666666-6666-4666-8666-666666666661',
      key: 'free',
      monthlyCreditAllowance: 10,
      priceMinor: 0,
      currency: 'IRT',
      active: true,
    },
    {
      publicId: '66666666-6666-4666-8666-666666666662',
      key: 'pro',
      monthlyCreditAllowance: 100,
      priceMinor: 100000,
      currency: 'IRT',
      active: true,
    },
    {
      publicId: '66666666-6666-4666-8666-666666666663',
      key: 'max',
      monthlyCreditAllowance: 500,
      priceMinor: 300000,
      currency: 'IRT',
      active: true,
    },
  ];
}

function buildUser(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    publicId: '22222222-2222-4222-8222-222222222222',
    email: 'user@example.com',
    role: 'user',
    status: 'active',
    tier: 'free',
    creditBalance: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildReport(
  overrides: Partial<AdminMisidentificationReport> = {},
): AdminMisidentificationReport {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    status: 'open',
    note: 'به نظر گیاه دیگری است',
    aiResult: { species: 'Epipremnum aureum', confidence: 0.4 },
    photoUrl: 'https://example.com/photo.jpg',
    scanId: '44444444-4444-4444-8444-444444444444',
    reporterUserId: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

let createdSpecies: AdminSpecies | null = null;

const server = setupServer(
  http.get('*/v1/admin/species', () => HttpResponse.json([buildSpecies()])),
  http.post('*/v1/admin/species', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    createdSpecies = buildSpecies({
      publicId: '55555555-5555-4555-8555-555555555555',
      scientificName: body.scientificName as string,
      commonNameFa: (body.commonNameFa as string | null) ?? null,
      careGuide: (body.careGuide as AdminSpecies['careGuide']) ?? null,
    });
    return HttpResponse.json(createdSpecies);
  }),
  http.patch('*/v1/admin/species/:publicId', async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      buildSpecies({
        publicId: params.publicId as string,
        scientificName: (body.scientificName as string) ?? 'Sansevieria trifasciata',
      }),
    );
  }),
  http.get('*/v1/admin/config', () => HttpResponse.json(buildConfig())),
  http.patch('*/v1/admin/config', async ({ request }) => {
    const body = (await request.json()) as Partial<AdminConfig>;
    return HttpResponse.json(buildConfig(body));
  }),
  http.get('*/v1/admin/tiers', () => HttpResponse.json(buildTiers())),
  http.patch('*/v1/admin/tiers', async ({ request }) => {
    const body = (await request.json()) as { key: 'free' | 'pro' | 'max' };
    const tier = buildTiers().find((t) => t.key === body.key) as AdminTier;
    return HttpResponse.json({ ...tier, ...body });
  }),
  http.get('*/v1/admin/users', () => HttpResponse.json({ data: [buildUser()], nextCursor: null })),
  http.patch('*/v1/admin/users/:publicId', async ({ params }) =>
    HttpResponse.json(buildUser({ publicId: params.publicId as string, creditBalance: 15 })),
  ),
  http.get('*/v1/admin/misidentification-reports', () =>
    HttpResponse.json({ data: [buildReport()], nextCursor: null }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  // Unmount BEFORE touching shared state below: `AdminLayout`'s redirect
  // `useEffect` depends on the auth store, so resetting it while a tree is
  // still mounted would schedule (and asynchronously flush) another
  // `router.replace('/')` call that lands after `mockClear()` — polluting
  // the NEXT test's assertions on `routerReplaceMock`.
  cleanup();
  server.resetHandlers();
  createdSpecies = null;
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
  routerReplaceMock.mockClear();
});
afterAll(() => server.close());

function renderAdminLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminLayout>
        <div />
      </AdminLayout>
    </QueryClientProvider>,
  );
}

describe('AdminLayout', () => {
  it('redirects away from /admin when there is no authenticated session', () => {
    renderAdminLayout();

    expect(screen.getByTestId('admin-layout-redirecting')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-layout')).not.toBeInTheDocument();
    expect(routerReplaceMock).toHaveBeenCalledWith('/');
  });

  it('redirects a non-admin authenticated user away from /admin', () => {
    useAuthStore.setState({
      accessToken: NON_ADMIN_TOKEN,
      user: null,
      justConvertedFromGuest: false,
    });

    renderAdminLayout();

    expect(screen.getByTestId('admin-layout-redirecting')).toBeInTheDocument();
    expect(routerReplaceMock).toHaveBeenCalledWith('/');
  });

  it('renders the admin layout for an admin session and lets every section render + submit', async () => {
    useAuthStore.setState({ accessToken: ADMIN_TOKEN, user: null, justConvertedFromGuest: false });
    const user = userEvent.setup();

    renderAdminLayout();

    expect(await screen.findByTestId('admin-layout')).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();

    // --- Catalog tab (default) ---
    expect(await screen.findByTestId('catalog-list')).toBeInTheDocument();
    expect(screen.getByText('Sansevieria trifasciata')).toBeInTheDocument();

    await user.type(screen.getByLabelText('نام علمی'), 'Epipremnum aureum');
    await user.click(screen.getByRole('button', { name: 'افزودن گونه' }));

    expect(await screen.findByTestId('catalog-create-success')).toBeInTheDocument();
    expect(createdSpecies?.scientificName).toBe('Epipremnum aureum');

    // --- Config tab ---
    await user.click(screen.getByTestId('admin-tab-config'));
    expect(await screen.findByTestId('config-editor-form')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ذخیره تنظیمات' }));
    expect(await screen.findByTestId('config-editor-submit-success')).toBeInTheDocument();

    const freeTierForm = await screen.findByTestId('config-tier-form-free');
    await user.click(within(freeTierForm).getByRole('button', { name: 'ذخیره' }));
    expect(await within(freeTierForm).findByTestId('config-tier-success-free')).toBeInTheDocument();

    // --- Users tab ---
    await user.click(screen.getByTestId('admin-tab-users'));
    const usersList = await screen.findByTestId('users-admin-list');
    expect(within(usersList).getByText('user@example.com')).toBeInTheDocument();

    await user.click(
      screen.getByTestId('users-admin-select-button-22222222-2222-4222-8222-222222222222'),
    );
    expect(await screen.findByTestId('users-admin-detail')).toBeInTheDocument();

    await user.type(screen.getByLabelText('تعدیل اعتبار'), '10');
    await user.type(screen.getByLabelText('دلیل این اقدام (الزامی)'), 'اصلاح دستی موجودی');
    await user.click(screen.getByRole('button', { name: 'ثبت اقدام' }));

    expect(await screen.findByTestId('users-admin-confirm-dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('users-admin-confirm-submit'));
    expect(await screen.findByTestId('users-admin-action-success')).toBeInTheDocument();

    // --- Reports tab ---
    await user.click(screen.getByTestId('admin-tab-reports'));
    expect(await screen.findByTestId('reports-admin-list')).toBeInTheDocument();
    expect(
      screen.getByTestId('reports-admin-ai-result-33333333-3333-4333-8333-333333333333'),
    ).toHaveTextContent('Epipremnum aureum');
    expect(
      screen.getByTestId('reports-admin-photo-33333333-3333-4333-8333-333333333333'),
    ).toBeInTheDocument();
  });
});
