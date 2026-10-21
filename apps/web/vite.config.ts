import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './server/apiPlugin'

export default defineConfig(({ mode }) => {
  // API-nyckeln läses bara på servern. Vite exponerar endast VITE_-variabler till webbläsaren.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
  // The API (apps/api) listens on PORT from the root .env, 3000 by default.
  const apiPort = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '').PORT || '3000'
  return {
    plugins: [react(), apiPlugin()],
    // /api/v1 belongs to the API; the AI routes under /api stay in apiPlugin until they move (#20).
    server: { proxy: { '/api/v1': `http://localhost:${apiPort}` } },
    // Vite 6's default browser target, kept when upgrading to Vite 8 (whose default needs Safari 16), so the
    // upgrade drops no browser; a browser-support policy is decided separately (#61).
    build: { target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'] },
    // Vitest runs unit tests only; Playwright owns *.spec.ts under e2e/.
    test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
  }
})
