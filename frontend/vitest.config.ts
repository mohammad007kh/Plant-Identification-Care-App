import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Frontend-local Vitest config. Vitest resolves config relative to `cwd`
 * (does not walk up to the root `vitest.config.ts`, which targets the
 * NestJS backend's `node` environment + SWC decorator metadata), so the
 * frontend needs its own: `jsdom` for React component rendering, the `@/*`
 * path alias to match `tsconfig.json`, and `@vitejs/plugin-react` to
 * transform TSX in tests (Next's own SWC pipeline is not used by Vitest).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
    // Heavy MSW + Testing-Library integration flows (e.g. the admin four-section
    // test) can exceed the 5s default under machine load; give them headroom.
    testTimeout: 20000,
  },
});
