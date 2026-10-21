import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './server/apiPlugin'

export default defineConfig(({ mode }) => {
  // API-nyckeln läses bara på servern. Vite exponerar endast VITE_-variabler till webbläsaren.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
  return {
    plugins: [react(), apiPlugin()],
    // Vite 6's default browser target, kept when upgrading to Vite 8 (whose default needs Safari 16), so the
    // upgrade drops no browser; a browser-support policy is decided separately (#61).
    build: { target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'] },
    // Vitest runs unit tests only; Playwright owns *.spec.ts under e2e/.
    test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
  }
})
