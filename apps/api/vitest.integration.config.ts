import { defineConfig } from 'vitest/config'

// Integration tests against the Compose Postgres (`docker compose up --wait`). The global setup recreates the test
// database and migrates it, so a run never depends on what an earlier run left behind.
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['test/integration-setup.ts'],
    // One database for the whole run: test files run one at a time, so they never see each other's rows.
    fileParallelism: false,
  },
})
