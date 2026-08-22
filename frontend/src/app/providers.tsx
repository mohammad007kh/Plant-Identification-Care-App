'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UpgradeModal, CheckoutReturnBanner } from '@/features/billing';
import { SessionBootstrap } from '@/components/auth/session-bootstrap';

/**
 * App-wide client providers.
 *
 * Every feature under `features/*` calls TanStack Query hooks
 * (`useQuery`/`useMutation`/`useInfiniteQuery`) assuming a `QueryClientProvider`
 * ancestor. Without this wrapper mounted above the route tree, the first such
 * hook to render throws "No QueryClient set" — this was the critical wiring
 * gap this task closes. One `QueryClient` instance per browser session,
 * created lazily via `useState` so it's stable across re-renders (a plain
 * module-level singleton would work too, but `useState` also protects against
 * ever sharing one instance across users if a server-rendered path is added
 * later).
 *
 * Also mounts the two billing overlays that read their visibility entirely
 * from `useBillingStore` (`UpgradeModal`, `CheckoutReturnBanner`) — per the
 * `features/billing` barrel's own doc comment, mounting them globally (rather
 * than per-route) is this wiring pass's job, so any current or future trigger
 * of `openUpgradeModal()` / `setReturningFromCheckout(true)` — regardless of
 * which route the user is on — has somewhere to render into.
 * `CreditBalanceBadge` is NOT mounted here: unlike the two overlays it renders
 * inline content (not a global dialog/banner), so it's mounted where it's
 * displayed (the `/billing` route) instead.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {/* Rehydrates the session (transparent refresh) once on every hard load,
          before any protected route decides whether to redirect (T-057). */}
      <SessionBootstrap />
      {children}
      <UpgradeModal />
      <CheckoutReturnBanner />
    </QueryClientProvider>
  );
}

export default Providers;
