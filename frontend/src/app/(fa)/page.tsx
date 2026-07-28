import Container from '@mui/material/Container';
import { ScanFlow } from '@/features/scan';

/**
 * Home route: the guest-accessible scan flow (upload → poll → result), per
 * this wiring task's spec. `ScanFlow` is self-contained (owns its own
 * upload/poll/result state) and requires no auth — replaces the placeholder
 * that only proved the RTL/theme/i18n shell rendered.
 */
export default function HomePage() {
  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 8 }}>
      <ScanFlow />
    </Container>
  );
}
