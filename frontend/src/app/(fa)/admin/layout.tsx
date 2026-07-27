'use client';

import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { CatalogEditor } from '@/features/admin/catalog-editor';
import { ConfigEditor } from '@/features/admin/config-editor';
import { UsersAdmin } from '@/features/admin/users-admin';
import { ReportsAdmin } from '@/features/admin/reports-admin';
import { getRoleFromAccessToken } from '@/features/admin/lib/get-role-from-token';

type AdminTab = 'catalog' | 'config' | 'users' | 'reports';

/**
 * Admin route group layout (US9, FR-024/FR-025/FR-026/FR-027): gates
 * `/admin/*` to `role=admin` and — since T-142 owns no separate `page.tsx`
 * (route registration is `T-147`'s wiring concern) — renders the four admin
 * sections itself, switched by tab.
 *
 * The role check decodes the access JWT's `role` claim client-side
 * (`get-role-from-token.ts`) purely for UX: a non-admin (or logged-out)
 * visitor is redirected to `/` immediately. This is NOT a security boundary —
 * the backend `AdminGuard` (T-140/T-141/T-147) is the one that actually
 * enforces `role=admin` on every `/v1/admin/*` request; a forged/hand-edited
 * client-side check here can never bypass it.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const messages = getMessages(defaultLocale).admin.layout;
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAdmin = getRoleFromAccessToken(accessToken) === 'admin';
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>('catalog');

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, router]);

  if (!isAdmin) {
    return (
      <Stack
        alignItems="center"
        spacing={2}
        role="status"
        aria-live="polite"
        data-testid="admin-layout-redirecting"
        sx={{ py: 8 }}
      >
        <CircularProgress aria-label={messages.redirectingLabel} />
        <Typography variant="body2">{messages.redirectingLabel}</Typography>
      </Stack>
    );
  }

  const handleTabChange = (_event: SyntheticEvent, value: AdminTab) => {
    setActiveTab(value);
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 8 }} data-testid="admin-layout">
      <Typography variant="h4" component="h1" gutterBottom>
        {messages.heading}
      </Typography>

      <Tabs value={activeTab} onChange={handleTabChange} aria-label={messages.tabsAriaLabel}>
        <Tab label={messages.tabs.catalog} value="catalog" data-testid="admin-tab-catalog" />
        <Tab label={messages.tabs.config} value="config" data-testid="admin-tab-config" />
        <Tab label={messages.tabs.users} value="users" data-testid="admin-tab-users" />
        <Tab label={messages.tabs.reports} value="reports" data-testid="admin-tab-reports" />
      </Tabs>

      <Box sx={{ mt: 3 }}>
        {activeTab === 'catalog' && <CatalogEditor />}
        {activeTab === 'config' && <ConfigEditor />}
        {activeTab === 'users' && <UsersAdmin />}
        {activeTab === 'reports' && <ReportsAdmin />}
      </Box>

      {children}
    </Container>
  );
}
