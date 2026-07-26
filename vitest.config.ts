import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Root Vitest config. Colocated test files (`*.test.ts` / `*.spec.ts`).
// 80% coverage threshold is enforced (fails the run when under) once tests exist.
// `passWithNoTests` keeps early scaffolding green before feature tests land.
// Injected before any test module loads (some Nest modules validate these env
// vars at import time). Fall back to the docker-compose defaults; CI/local env wins.
const testEnv = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:5433/plant',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'test-access-secret',
  DISABLE_WORKERS: process.env.DISABLE_WORKERS ?? '1',
};

export default defineConfig({
  // SWC transform emits `design:*` decorator metadata (esbuild does not), which
  // NestJS constructor injection requires — without it, DI-based integration
  // tests get providers with undefined dependencies.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: { transform: { legacyDecorator: true, decoratorMetadata: true } },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    env: testEnv,
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
