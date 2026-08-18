import { defineConfig, devices } from '@playwright/test'

// Smoke-level end-to-end cover for the PRODUCTION bundle. The vitest suite
// mounts App under jsdom, which cannot catch a broken build output, a chunk that
// 404s, or a module that only explodes in a real browser — this can.
//
// It builds and serves dist/ itself so CI needs no extra steps beyond `npm run e2e`.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
