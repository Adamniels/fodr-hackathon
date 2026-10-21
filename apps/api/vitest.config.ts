import { defineConfig } from 'vitest/config'

// Unit tests: no database or other service. Integration tests have their own config.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], exclude: ['src/**/*.integration.test.ts'] },
})
