import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { CARE_GUIDE_FIELD_KEYS, readStringField } from '../lib/plant-fields';

export interface CareGuideCardProps {
  /** `species.careGuide` — jsonb, typed `unknown` until a dedicated schema lands (`T-060`). */
  careGuide: unknown;
}

/**
 * Structured care-guide display for a plant's identified species (US3):
 * watering, light, soil, humidity, temperature, notes
 * (`data-model.md` `care_guide` jsonb). Renders empty-state copy instead of
 * a blank card when no field has a usable value (e.g. no species identified
 * yet, or the species record has no authored care guide).
 */
export function CareGuideCard({ careGuide }: CareGuideCardProps) {
  const messages = getMessages(defaultLocale).plants.careGuide;

  const entries = CARE_GUIDE_FIELD_KEYS.map((key) => ({
    key,
    value: readStringField(careGuide, key),
  })).filter(
    (entry): entry is { key: (typeof CARE_GUIDE_FIELD_KEYS)[number]; value: string } =>
      entry.value !== null,
  );

  return (
    <Card data-testid="care-guide-card" variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" component="h3" gutterBottom>
          {messages.heading}
        </Typography>

        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" data-testid="care-guide-empty-state">
            {messages.emptyState}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {entries.map(({ key, value }) => (
              <Stack key={key} direction="row" spacing={1}>
                <Typography variant="body2" fontWeight="bold" component="span">
                  {messages.fields[key]}:
                </Typography>
                <Typography variant="body2" component="span">
                  {value}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
