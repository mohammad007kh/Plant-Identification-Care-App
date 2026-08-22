import Container from '@mui/material/Container';
import { NotificationSettings } from '@/features/settings/notification-settings';

/**
 * Notification-preferences route (US7). No barrel exists for the `settings`
 * feature yet, so this imports the component's own file directly — the same
 * direct-import pattern the codebase already uses for barrel-less features
 * (e.g. `PlantDetail`'s import of `comparison`/`chat`).
 */
export default function SettingsPage() {
  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 8 }}>
      <NotificationSettings />
    </Container>
  );
}
