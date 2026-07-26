import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Plant } from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import { PlantDetail } from './plant-detail';

const TEST_ACCESS_TOKEN = 'access-token-abc';
const PLANT_ID = '11111111-1111-4111-8111-111111111111';

function buildCompletePlant(): Plant {
  return {
    id: PLANT_ID,
    nickname: 'برگ سبز',
    species: {
      id: 'species-1',
      scientificName: 'Sansevieria trifasciata',
      commonNameFa: 'سانسوریا',
      careGuide: {
        watering: 'هر ۲ هفته یک‌بار',
        light: 'نور غیرمستقیم',
        soil: 'خاک زهکش‌دار',
        humidity: 'متوسط',
        temperature: '۱۸ تا ۲۷ درجه',
        notes: 'از آبیاری زیاد پرهیز کنید.',
      },
    },
    photos: [
      { id: 'photo-older', createdAt: '2026-01-01T00:00:00.000Z', width: 800, height: 600 },
      { id: 'photo-newer', createdAt: '2026-03-01T00:00:00.000Z', width: 1024, height: 768 },
    ],
  };
}

function buildBarePlant(): Plant {
  return {
    id: PLANT_ID,
    nickname: null,
    species: null,
    photos: [],
  };
}

let getCallCount = 0;

const server = setupServer(
  http.get('*/v1/plants/:id', () => {
    getCallCount += 1;
    return HttpResponse.json(buildCompletePlant());
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
  getCallCount = 0;
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
});

afterAll(() => server.close());

function renderPlantDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PlantDetail plantId={PLANT_ID} />
    </QueryClientProvider>,
  );
}

describe('PlantDetail', () => {
  it('shows a loading state while the plant is being fetched', async () => {
    renderPlantDetail();

    expect(screen.getByTestId('plant-detail-loading')).toBeInTheDocument();

    // Let the in-flight request settle before the test ends, so its resolution
    // (which flips React state) never lands outside an `act` boundary.
    await screen.findByTestId('plant-detail');
  });

  it('renders the nickname/species header, structured care guide, and photo history (newest first) for a complete plant', async () => {
    renderPlantDetail();

    expect(await screen.findByTestId('plant-detail')).toBeInTheDocument();
    expect(screen.getByText('برگ سبز')).toBeInTheDocument();
    expect(screen.getByText('سانسوریا')).toBeInTheDocument();

    const careGuideCard = screen.getByTestId('care-guide-card');
    expect(careGuideCard).toHaveTextContent('آبیاری');
    expect(careGuideCard).toHaveTextContent('هر ۲ هفته یک‌بار');
    expect(careGuideCard).toHaveTextContent('یادداشت‌ها');
    expect(careGuideCard).toHaveTextContent('از آبیاری زیاد پرهیز کنید.');

    const photoHistory = screen.getByTestId('photo-history');
    const items = photoHistory.querySelectorAll('li');
    expect(items).toHaveLength(2);
    // Newest first: `photo-newer` (2026-03-01) precedes `photo-older` (2026-01-01).
    expect(items[0]).toHaveTextContent('2026-03-01T00:00:00.000Z');
    expect(items[1]).toHaveTextContent('2026-01-01T00:00:00.000Z');
  });

  it('renders care-guide and photo-history empty states when the plant has no species and no photos', async () => {
    server.use(http.get('*/v1/plants/:id', () => HttpResponse.json(buildBarePlant())));

    renderPlantDetail();

    expect(await screen.findByTestId('plant-detail')).toBeInTheDocument();
    expect(screen.getByTestId('care-guide-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('photo-history-empty-state')).toBeInTheDocument();
  });

  it('renders an error state with a retry button on fetch failure, and retries on click', async () => {
    server.use(
      http.get('*/v1/plants/:id', () => {
        getCallCount += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    renderPlantDetail();

    expect(await screen.findByTestId('plant-detail-error')).toBeInTheDocument();
    expect(getCallCount).toBe(1);

    server.use(http.get('*/v1/plants/:id', () => HttpResponse.json(buildCompletePlant())));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    expect(await screen.findByTestId('plant-detail')).toBeInTheDocument();
  });
});
