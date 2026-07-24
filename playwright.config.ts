import { defineConfig, devices } from '@playwright/test';

// E2E config. Specs live under `e2e/` (added with their features, e.g. T-190).
// Targets the local frontend; assumes the app + backend are running (or started
// via webServer) at localhost:3000.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'fa-IR',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
