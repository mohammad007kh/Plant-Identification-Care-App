import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Plant } from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import { PlantList } from './plant-list';

const TEST_ACCESS_TOKEN = 'access-token-abc';

function buildPlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    nickname: null,
    species: null,
    photos: [],
    ...overrides,
  };
}

let listCallCount = 0;

const server = setupServer(
  http.get('*/v1/plants', () => {
    listCallCount += 1;
    return HttpResponse.json({ data: [], nextCursor: null });
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
  listCallCount = 0;
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
});

afterAll(() => server.close());

function renderPlantList(onScanClick = vi.fn(), onSelectPlant = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    onScanClick,
    onSelectPlant,
    ...render(
      <QueryClientProvider client={queryClient}>
        <PlantList onSelectPlant={onSelectPlant} onScanClick={onScanClick} />
      </QueryClientProvider>,
    ),
  };
}

describe('PlantList', () => {
  it('shows a loading state while the plants list is being fetched', async () => {
    renderPlantList();

    expect(screen.getByTestId('plant-list-loading')).toBeInTheDocument();

    // Let the in-flight request settle before the test ends, so its resolution
    // (which flips React state) never lands outside an `act` boundary.
    await screen.findByTestId('plant-list-empty-state');
  });

  it('renders the empty-state prompt for a user with zero saved plants', async () => {
    const { onScanClick } = renderPlantList();

    expect(await screen.findByTestId('plant-list-empty-state')).toBeInTheDocument();
    expect(screen.getByText('هنوز گیاهی ذخیره نکرده‌اید')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'شناسایی اولین گیاه' }));

    expect(onScanClick).toHaveBeenCalledTimes(1);
  });

  it('renders a plant card per saved plant for a populated list', async () => {
    server.use(
      http.get('*/v1/plants', () =>
        HttpResponse.json({
          data: [
            buildPlant({
              id: '11111111-1111-4111-8111-111111111111',
              nickname: 'برگ سبز',
              species: { commonNameFa: 'سانسوریا', scientificName: 'Sansevieria trifasciata' },
              photos: [{ id: 'p1' }, { id: 'p2' }],
            }),
            buildPlant({
              id: '22222222-2222-4222-8222-222222222222',
              nickname: null,
              species: { commonNameFa: 'پوتوس', scientificName: 'Epipremnum aureum' },
              photos: [],
            }),
          ],
          nextCursor: null,
        }),
      ),
    );

    const { onSelectPlant } = renderPlantList();

    expect(await screen.findByTestId('plant-list')).toBeInTheDocument();
    expect(screen.getByText('برگ سبز')).toBeInTheDocument();
    expect(screen.getByText('سانسوریا')).toBeInTheDocument();
    expect(screen.getByText('پوتوس')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('plant-card-22222222-2222-4222-8222-222222222222'));

    expect(onSelectPlant).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });

  it('renders an error state with a retry button on fetch failure, and retries on click', async () => {
    server.use(
      http.get('*/v1/plants', () => {
        listCallCount += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    renderPlantList();

    expect(await screen.findByTestId('plant-list-error')).toBeInTheDocument();
    expect(listCallCount).toBe(1);

    server.use(http.get('*/v1/plants', () => HttpResponse.json({ data: [], nextCursor: null })));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    expect(await screen.findByTestId('plant-list-empty-state')).toBeInTheDocument();
  });
});
