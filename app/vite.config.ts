import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './server/apiPlugin'

export default defineConfig(({ mode }) => {
  // API-nyckeln läses bara på servern. Vite exponerar endast VITE_-variabler till webbläsaren.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
  return {
    plugins: [react(), apiPlugin()],
  }
})
