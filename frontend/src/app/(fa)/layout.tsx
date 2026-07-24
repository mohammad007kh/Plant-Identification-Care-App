import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ThemeRegistry from '@/theme/theme-provider';
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
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
