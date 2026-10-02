import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the production build (`npm run test:e2e` builds first).
 * They cover the flows people use most, on a desktop and on a phone-sized touch screen.
 *
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE lets you point at an already installed Chromium
 * instead of running `npx playwright install chromium`.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: 'desktop',
      testMatch: ['desktop.spec.ts', 'pdf.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 820 } },
    },
    {
      name: 'celular',
      testMatch: ['celular.spec.ts', 'pdf-celular.spec.ts'],
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
