import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ThemeRegistry from '@/theme/theme-provider';
import { AppErrorBoundary } from '@/components/errors/error-boundary';
import { OfflineBanner } from '@/components/errors/offline-banner';
import '@/theme/fonts/vazirmatn.css';

export const metadata: Metadata = {
  title: 'شناسایی و مراقبت از گیاه',
  description: 'شناسایی گیاهان از روی عکس برگ و مراقبت هوشمند از آن‌ها با هوش مصنوعی',
};

/**
 * Root layout for the `fa` locale segment (route group `(fa)`, so it does
 * not appear in the URL). This is the ONLY top-level layout under `src/app`
 * today, so it also serves as the Next.js root layout — it must render
 * `<html>`/`<body>`.
 *
 * `lang="fa"` + `dir="rtl"` here is the FR-029 / RTL gate requirement:
 * every page in the app renders inside this shell.
 */
export default function FaLocaleLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <ThemeRegistry>
          {/* T-161/FR-030: app-wide crash fallback + connectivity banner, above
              every page so no route can end up with a blank screen or a
              silent hang on a render crash or an offline connection. */}
          <OfflineBanner />
          <AppErrorBoundary>{children}</AppErrorBoundary>
        </ThemeRegistry>
      </body>
    </html>
  );
}
