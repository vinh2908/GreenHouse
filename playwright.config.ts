import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/qa-2026-10-20/browser-results.json' }],
    ['html', { outputFolder: 'reports/qa-2026-10-20/browser-report', open: 'never' }],
  ],
  outputDir: 'reports/qa-2026-10-20/browser-artifacts',
  use: { headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
