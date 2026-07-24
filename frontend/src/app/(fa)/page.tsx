import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { getMessages, defaultLocale } from '@/i18n';

/**
 * Placeholder home page — proves the RTL + MUI/Emotion theme + i18n
 * wiring renders end-to-end in Persian. Later tasks (scan/upload flow)
 * replace this content; this task only wires the shell (no business
 * feature, no navigation).
 *
 * Only block-axis spacing (`mt`) is used below — block-axis (top/bottom)
 * properties are directionally invariant between LTR/RTL, unlike
 * inline-axis (left/right) ones, which this task's files must avoid.
 */
export default function HomePage() {
  const messages = getMessages(defaultLocale);

  return (
    <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
      <Typography variant="h1" component="h1" gutterBottom>
        {messages.home.greeting}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {messages.app.title}
      </Typography>
    </Container>
  );
}
