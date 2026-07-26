'use client';

import Avatar from '@mui/material/Avatar';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Plant } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { readStringField } from '../lib/plant-fields';

export interface PlantCardProps {
  plant: Plant;
  /** Called with `plant.id` (opaque `public_id`) when the card is activated. */
  onSelect: (plantId: string) => void;
}

/**
 * Single plant summary card rendered by `PlantList` (US3): a thumbnail,
 * nickname/species, and a tap-through to `PlantDetail`. `plant.species` is
 * typed `unknown` in the shared contract (its dedicated schema is a future
 * task), so the display name is read defensively — an unexpected shape
 * degrades to the generic fallback label, never a crash.
 *
 * No photo-serving URL is exposed by the `T-060` `Plant`/`photos` contract
 * yet (each photo carries only metadata — dimensions, content type,
 * timestamp) — the card renders a neutral placeholder avatar instead of an
 * `<img>` until a photo-serving endpoint exists.
 */
export function PlantCard({ plant, onSelect }: PlantCardProps) {
  const messages = getMessages(defaultLocale).plants.card;

  const commonName = readStringField(plant.species, 'commonNameFa');
  const scientificName = readStringField(plant.species, 'scientificName');
  const speciesName = commonName ?? scientificName;
  const title = plant.nickname ?? speciesName ?? messages.unknownSpeciesName;
  const subtitle = plant.nickname && speciesName ? speciesName : null;

  return (
    <Card variant="outlined">
      <CardActionArea
        data-testid={`plant-card-${plant.id}`}
        onClick={() => onSelect(plant.id)}
        sx={{ p: 2 }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            variant="rounded"
            aria-hidden="true"
            sx={{ width: 56, height: 56, bgcolor: 'success.light' }}
          >
            {title.charAt(0)}
          </Avatar>
          <CardContent sx={{ flex: 1, p: '0 !important' }}>
            <Typography variant="subtitle1" component="h3">
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {plant.photos.length} {messages.photoCountSuffix}
            </Typography>
          </CardContent>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
