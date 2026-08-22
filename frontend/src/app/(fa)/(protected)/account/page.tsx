import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import { PendingDeletionBanner } from '@/features/account/pending-deletion-banner';
import { DeleteAccount } from '@/features/account/delete-account';

/**
 * Account route (US8): the persistent "pending deletion" banner (renders
 * nothing unless a deletion is actually pending) above the danger-zone delete
 * action. No barrel exists for the `account` feature yet, so both components
 * are imported directly from their own files (see `settings/page.tsx` for the
 * same barrel-less pattern already used elsewhere in this codebase).
 */
export default function AccountPage() {
  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 8 }}>
      <Stack spacing={3}>
        <PendingDeletionBanner />
        <DeleteAccount />
      </Stack>
    </Container>
  );
}
