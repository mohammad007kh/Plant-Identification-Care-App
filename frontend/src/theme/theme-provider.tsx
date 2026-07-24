'use client';

import type { ReactNode } from 'react';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme';
import { createRtlCache } from './rtl-cache';

const rtlCache = createRtlCache();

/**
 * Wraps the app tree in the RTL Emotion cache + MUI theme.
 * Client component: Emotion's CacheProvider and MUI's ThemeProvider both
 * rely on React context, which requires a client boundary in the App
 * Router.
 */
export function ThemeRegistry({ children }: { children: ReactNode }) {
  return (
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}

export default ThemeRegistry;
