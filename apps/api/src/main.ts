// Starts the API: `npm run dev` in development, `node dist/main.mjs` in the image (Dockerfile).
import { createAnthropicProvider } from './ai/anthropic'
import { runServer } from './server'

runServer((config) => createAnthropicProvider({ apiKey: config.anthropicApiKey }))
