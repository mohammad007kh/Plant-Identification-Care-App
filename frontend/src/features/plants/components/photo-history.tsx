import Avatar from '@mui/material/Avatar';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { readStringField, readUnknownField } from '../lib/plant-fields';

export interface PhotoHistoryProps {
  /** `plant.photos` — typed `unknown[]` in the shared contract; each entry read defensively. */
  photos: unknown[];
}

interface ReadPhoto {
  id: string;
  createdAt: string | null;
  width: number | null;
  height: number | null;
}

function readPhoto(raw: unknown, index: number): ReadPhoto {
  const width = readUnknownField(raw, 'width');
  const height = readUnknownField(raw, 'height');

  return {
    id: readStringField(raw, 'id') ?? `photo-${index}`,
    createdAt: readStringField(raw, 'createdAt'),
    width: typeof width === 'number' ? width : null,
    height: typeof height === 'number' ? height : null,
  };
}

/** Newest first — undated entries (unexpected shape) sort after dated ones, stably. */
function byNewestFirst(a: ReadPhoto, b: ReadPhoto): number {
  if (a.createdAt && b.createdAt) {
    return b.createdAt.localeCompare(a.createdAt);
  }

  if (a.createdAt) return -1;
  if (b.createdAt) return 1;
  return 0;
}

/**
 * Ordered photo-history list for `PlantDetail` (US3, FR-009/FR-010):
 * newest photo first — consistent, deterministic ordering regardless of the
 * order the API returns rows in. No photo-serving URL is exposed by the
 * `T-060` `Plant`/`photos` contract yet (each photo carries only metadata:
 * dimensions, content type, timestamp), so each entry renders as a metadata
 * row rather than an `<img>` thumbnail.
 */
export function PhotoHistory({ photos }: PhotoHistoryProps) {
  const messages = getMessages(defaultLocale).plants.photoHistory;

  if (photos.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="photo-history-empty-state">
        {messages.emptyState}
      </Typography>
    );
  }

  const entries = photos.map(readPhoto).sort(byNewestFirst);

  return (
    <div data-testid="photo-history">
      <Typography variant="subtitle1" component="h3" gutterBottom>
        {messages.heading}
      </Typography>
      <List disablePadding>
        {entries.map((photo) => (
          <ListItem key={photo.id} data-testid={`photo-history-item-${photo.id}`} disableGutters>
            <ListItemAvatar>
              <Avatar variant="rounded" aria-hidden="true" />
            </ListItemAvatar>
            <ListItemText
              primary={photo.createdAt ?? messages.unknownDate}
              secondary={photo.width && photo.height ? `${photo.width}×${photo.height}` : undefined}
            />
          </ListItem>
        ))}
      </List>
    </div>
  );
}
