import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ScanJob } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { ScanLowConfidencePrompt } from './scan-low-confidence-prompt';

export interface ScanResultProps {
  job: ScanJob;
  onRetry: () => void;
}

/**
 * `species`/`careGuide` are typed `unknown` in the shared `ScanJob` contract
 * (their dedicated schema lands in a later task) — read fields defensively
 * so an unexpected shape degrades to "field omitted", never a crash.
 */
function readStringField(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const CARE_GUIDE_FIELD_KEYS = ['watering', 'light', 'soil', 'humidity', 'temperature'] as const;

/**
 * FR-003: renders species + structured care guide ONLY when `lowConfidence`
 * is false and `species` is present; otherwise renders the low-confidence
 * prompt EXCLUSIVELY (early return — the confident-result markup below
 * never mounts, so it is entirely absent from the DOM, not just hidden).
 */
export function ScanResult({ job, onRetry }: ScanResultProps) {
  const messages = getMessages(defaultLocale).scan.result;

  if (job.lowConfidence || job.species === null || job.species === undefined) {
    return <ScanLowConfidencePrompt message={job.message} onRetry={onRetry} />;
  }

  const commonName = readStringField(job.species, 'commonName');
  const scientificName = readStringField(job.species, 'scientificName');
  const speciesName = commonName ?? scientificName ?? messages.unknownSpeciesName;

  return (
    <Card data-testid="scan-result">
      <CardContent>
        <Typography variant="h5" component="h2" gutterBottom>
          {speciesName}
        </Typography>

        {commonName && scientificName && (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {scientificName}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" gutterBottom>
          {messages.careGuide.heading}
        </Typography>

        <Stack spacing={1}>
          {CARE_GUIDE_FIELD_KEYS.map((key) => {
            const value = readStringField(job.careGuide, key);

            if (!value) {
              return null;
            }

            return (
              <Stack key={key} direction="row" spacing={1}>
                <Typography variant="body2" fontWeight="bold" component="span">
                  {messages.careGuide.fields[key]}:
                </Typography>
                <Typography variant="body2" component="span">
                  {value}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default ScanResult;
