import Container from '@mui/material/Container';
import { PlantDetail } from '@/features/plants';

interface PlantDetailPageProps {
  /** Next.js 15: dynamic route `params` are async. */
  params: Promise<{ id: string }>;
}

/**
 * Saved-plant detail route (US3). `PlantDetail` already mounts the
 * health-comparison panel (US5) and the AI chat entry point (US6) internally,
 * so this route is a plain server component wiring the `id` route param
 * through to it — no client-side state or navigation callbacks are needed at
 * this level.
 */
export default async function PlantDetailPage({ params }: PlantDetailPageProps) {
  const { id } = await params;

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 8 }}>
      <PlantDetail plantId={id} />
    </Container>
  );
}
