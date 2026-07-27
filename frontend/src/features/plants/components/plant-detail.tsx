'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
// No barrel exists yet for the `comparison`/`chat` features (T-101/T-111 add
// only their own panel + hook); a direct file import is used here rather
// than adding an unrequested `index.ts`, matching how `photo-uploader.tsx`
// reaches into `../../auth` today for its own cross-feature dependency.
import { ComparisonPanel } from '../../comparison/comparison-panel';
import { ChatPanel } from '../../chat/chat-panel';
import { usePlantDetail } from '../hooks/use-plant-detail';
import { readStringField, readUnknownField } from '../lib/plant-fields';
import { CareGuideCard } from './care-guide-card';
import { PhotoHistory } from './photo-history';

export interface PlantDetailProps {
  /** Opaque `public_id` of the plant to display — the route param is `T-077`'s concern. */
  plantId: string;
}

/**
 * Plant profile detail view (US3): nickname/species header, structured
 * care guide, and ordered photo history, backed by `usePlantDetail`.
 * Loading/error+retry states follow the same pattern as `PlantList` and
 * `ScanFlow` (sibling `scan` feature) — a retry button re-triggers the
 * query rather than reloading the page (spec: "fail gracefully ... with a
 * retry prompt", FR-030).
 */
export function PlantDetail({ plantId }: PlantDetailProps) {
  const messages = getMessages(defaultLocale).plants.detail;
  const chatEntryMessages = getMessages(defaultLocale).chat.entry;
  const query = usePlantDetail(plantId);
  // Lazy-mounted (T-111): `ChatPanel` fetches its own message history on
  // mount, so it stays unmounted until the user opts in — this view must not
  // fire that request just because a plant profile was opened.
  const [isChatOpen, setIsChatOpen] = useState(false);

  if (query.isLoading) {
    return (
      <Stack
        spacing={2}
        alignItems="center"
        role="status"
        aria-live="polite"
        data-testid="plant-detail-loading"
        sx={{ py: 6 }}
      >
        <CircularProgress aria-label={messages.loadingLabel} />
        <Typography variant="body1">{messages.loadingLabel}</Typography>
      </Stack>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Stack spacing={2} data-testid="plant-detail-error">
        <Alert severity="error">{messages.errorMessage}</Alert>
        <Button type="button" variant="contained" onClick={() => query.refetch()}>
          {messages.retryButton}
        </Button>
      </Stack>
    );
  }

  const plant = query.data;
  const commonName = readStringField(plant.species, 'commonNameFa');
  const scientificName = readStringField(plant.species, 'scientificName');
  const speciesName = commonName ?? scientificName;
  const title = plant.nickname ?? speciesName ?? messages.unknownSpeciesName;
  const subtitle = plant.nickname && speciesName ? speciesName : null;
  const photoIds = plant.photos
    .map((photo) => readStringField(photo, 'id'))
    .filter((id): id is string => id !== null);

  return (
    <Stack spacing={3} data-testid="plant-detail">
      <div>
        <Typography variant="h5" component="h2">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </div>

      <Divider />

      <CareGuideCard careGuide={readUnknownField(plant.species, 'careGuide')} />

      <Divider />

      <PhotoHistory photos={plant.photos} />

      <Divider />

      <ComparisonPanel plantId={plant.id} />

      <Divider />

      <Stack spacing={2}>
        <Button
          type="button"
          variant="outlined"
          onClick={() => setIsChatOpen((open) => !open)}
          sx={{ alignSelf: 'flex-start' }}
          data-testid="chat-entry-button"
        >
          {isChatOpen ? chatEntryMessages.closeButton : chatEntryMessages.openButton}
        </Button>

        {isChatOpen && <ChatPanel plantId={plant.id} photoIds={photoIds} />}
      </Stack>
    </Stack>
  );
}
