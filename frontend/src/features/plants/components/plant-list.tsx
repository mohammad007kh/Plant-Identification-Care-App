'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Plant } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { usePlantsList } from '../hooks/use-plants-list';
import { PlantCard } from './plant-card';
import { PlantListEmptyState } from './plant-list-empty-state';

export interface PlantListProps {
  /** Called with a plant's `id` when its card is activated (route navigation is `T-077`'s concern). */
  onSelectPlant: (plantId: string) => void;
  /** Forwarded to `PlantListEmptyState`'s CTA (route navigation is `T-077`'s concern). */
  onScanClick?: () => void;
}

/**
 * Profile plant list (US3): renders `PlantCard` items from `usePlantsList`,
 * or `PlantListEmptyState` when the user has zero saved plants (spec
 * Acceptance Scenario US3.3). Loading/error states follow the same
 * pattern as `ScanFlow`'s in-progress/retry states in the sibling `scan`
 * feature.
 */
export function PlantList({ onSelectPlant, onScanClick }: PlantListProps) {
  const messages = getMessages(defaultLocale).plants.list;
  const query = usePlantsList();

  if (query.isLoading) {
    return (
      <Stack
        spacing={2}
        alignItems="center"
        role="status"
        aria-live="polite"
        data-testid="plant-list-loading"
        sx={{ py: 6 }}
      >
        <CircularProgress aria-label={messages.loadingLabel} />
        <Typography variant="body1">{messages.loadingLabel}</Typography>
      </Stack>
    );
  }

  if (query.isError) {
    return (
      <Stack spacing={2} data-testid="plant-list-error">
        <Alert severity="error">{messages.errorMessage}</Alert>
        <Button type="button" variant="contained" onClick={() => query.refetch()}>
          {messages.retryButton}
        </Button>
      </Stack>
    );
  }

  const plants: Plant[] = query.data?.pages.flatMap((page) => page.data) ?? [];

  if (plants.length === 0) {
    return <PlantListEmptyState onScanClick={onScanClick} />;
  }

  return (
    <Stack spacing={2} data-testid="plant-list">
      {plants.map((plant) => (
        <PlantCard key={plant.id} plant={plant} onSelect={onSelectPlant} />
      ))}

      {query.hasNextPage && (
        <Button
          type="button"
          variant="outlined"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? messages.loadingMoreButton : messages.loadMoreButton}
        </Button>
      )}
    </Stack>
  );
}
