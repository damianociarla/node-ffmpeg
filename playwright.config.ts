import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.pw.ts',
  outputDir: './test-results',
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:44117/node-ffmpeg/',
  },
  webServer: {
    command: 'npm run docs:preview -- --host 127.0.0.1 --port 44117',
    url: 'http://127.0.0.1:44117/node-ffmpeg/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
