// Playwright end-to-end tests against a running Crewline server (API + built web app) on phone and laptop sizes.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8000',
    // Local runs use the installed Chrome; CI installs Playwright's Chromium and sets PW_CHANNEL=chromium.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 }, channel: process.env.PW_CHANNEL ?? 'chrome' } },
    { name: 'laptop', use: { viewport: { width: 1280, height: 860 } } },
  ],
});
