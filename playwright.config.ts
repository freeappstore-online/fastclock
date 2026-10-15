import { defineConfig, devices } from '@playwright/test'

// E2E tests run against the production build (vite preview), so the service
// worker and offline behaviour are the real thing.
const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // A DST-observing zone, matching the unit tests.
    timezoneId: 'America/New_York',
    locale: 'en-US',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `pnpm --filter @fastclock/web exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // CI may start the preview server itself; reuse it if it's already up.
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
