import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.pw.ts',
  outputDir: './test-results',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:44117/node-ffmpeg/',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1_440, height: 900 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: 'npm run docs:preview -- --host 127.0.0.1 --port 44117',
    url: 'http://127.0.0.1:44117/node-ffmpeg/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
