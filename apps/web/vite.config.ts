import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // The API (apps/api) listens on PORT from the root .env, 3000 by default; API_PORT overrides it (the e2e run's API).
  const apiPort =
    process.env.API_PORT ?? (loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '').PORT || '3000')
  return {
    plugins: [react()],
    // Every /api route belongs to the API (apps/api), the AI routes included (#20). Only VITE_ variables reach the
    // browser; the API key is read by the API alone.
    // A regular expression, so /api and /api/... match but a client route such as /apiary does not.
    server: { proxy: { '^/api(/|$)': `http://localhost:${apiPort}` } },
    // Vite 6's default browser target, kept when upgrading to Vite 8 (whose default needs Safari 16), so the
    // upgrade drops no browser; a browser-support policy is decided separately (#61).
    build: { target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'] },
    // Vitest runs unit tests only; Playwright owns *.spec.ts under e2e/.
    test: { include: ['src/**/*.test.ts'] },
  }
})
