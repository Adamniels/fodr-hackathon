import { defineConfig, devices } from '@playwright/test'

// E2E tests run against the real API (#23) and the Vite dev server, on ports of their own (3100 and 5174) so a
// running `npm run dev` is never reused, with the e2e database fodr_e2e recreated per run. They need the Compose
// services (`docker compose up --wait`): Postgres for the API and Mailpit for the account mail. The AI stays mocked
// in the browser (e2e/support/mock-ai.ts); /api/v1 and /api/auth reach the API. One e2e run per machine at a time:
// the ports and the database are fixed, and a second run would recreate the database under the first.
const WEB = 'http://localhost:5174'
const API_PORT = '3100'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --import tsx ../api/test/e2e-database.ts && node --import tsx ../api/src/main.ts',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      // The API's log lines in the test output, so a failure in CI shows the server side too.
      stdout: 'pipe',
      // Explicit, so no .env is needed and a developer's settings never leak in. Dev-only values.
      env: {
        // The Compose ports, moved by POSTGRES_PORT and SMTP_PORT when set in the shell, as in compose.yaml.
        DATABASE_URL: `postgres://fodr:fodr@127.0.0.1:${process.env.POSTGRES_PORT ?? '5432'}/fodr_e2e`,
        PORT: API_PORT,
        LOG_LEVEL: 'warn',
        BETTER_AUTH_SECRET: 'e2e-only-secret-of-at-least-32-characters',
        BETTER_AUTH_URL: WEB,
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: process.env.SMTP_PORT ?? '1025',
        MAIL_FROM: 'Fodr <no-reply@fodr.test>',
        // Playwright stands in for a trusted proxy: each test sends its own client IP, so the auth rate limits stay
        // on without one test's logins blocking another's (helpers.ts).
        CLIENT_IP_HEADER: 'x-e2e-client-ip',
      },
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: WEB,
      reuseExistingServer: false,
      env: { API_PORT },
    },
  ],
})
