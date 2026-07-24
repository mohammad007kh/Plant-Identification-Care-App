import { defineConfig } from 'vitest/config';

// Root Vitest config. Colocated test files (`*.test.ts` / `*.spec.ts`).
// 80% coverage threshold is enforced (fails the run when under) once tests exist.
// `passWithNoTests` keeps early scaffolding green before feature tests land.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**',
        '**/*.config.*',
        '**/*.d.ts',
        '**/db/seed.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
