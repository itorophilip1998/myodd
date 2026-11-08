import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30_000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: 'list',
  webServer: [
    { command: 'node tests/harness-server.cjs', url: 'http://127.0.0.1:3101', reuseExistingServer: false },
    { command: 'pnpm exec next dev -p 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 120_000,
      env: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '', CLERK_SECRET_KEY: '', API_PROXY_TARGET: 'http://127.0.0.1:3101', PUBLIC_WEB_URL: 'http://127.0.0.1:3100' } },
  ],
});
