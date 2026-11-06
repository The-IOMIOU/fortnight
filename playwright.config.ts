import { defineConfig, devices } from '@playwright/test';

// Tests run against the production build served by `vite preview` (run `npm run build` first).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 800 } },
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'chromium', testMatch: /(determinism|ui)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'firefox', testMatch: /determinism\.spec\.ts/, use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    // Headed Chromium with the real GPU, for frame-rate measurements.
    { name: 'perf', testMatch: /perf\.spec\.ts/, use: { ...devices['Desktop Chrome'], headless: false, viewport: { width: 1280, height: 800 } } },
  ],
});
