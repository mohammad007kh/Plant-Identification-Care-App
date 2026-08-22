'use client';

import { useRouter } from 'next/navigation';
import Container from '@mui/material/Container';
import { PlantList } from '@/features/plants';

/**
 * Saved-plants list route (US3). `PlantList` takes its navigation callbacks
 * as props rather than owning routing itself ("route navigation is T-077's
 * concern" per its own doc comment) — this route is that wiring: selecting a
 * plant goes to its detail route, and the empty-state CTA goes back to the
 * scan flow (home). Client component only because of these `useRouter`
 * callbacks; `PlantList` itself already handles its own loading/error/empty
 * states.
 */
export default function PlantsPage() {
  const router = useRouter();

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 8 }}>
      <PlantList
        onSelectPlant={(plantId) => router.push(`/plants/${plantId}`)}
        onScanClick={() => router.push('/')}
      />
    </Container>
  );
}
