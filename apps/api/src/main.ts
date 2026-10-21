// Starts the API: `npm run dev` in development, `node dist/main.mjs` in the image (Dockerfile).
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { parseConfig } from './config'
import { createLogger } from './logger'

const result = parseConfig(process.env)
if (!result.ok) {
  process.stderr.write(`${result.message}\n`)
  process.exit(1)
}
const { config } = result
const logger = createLogger(config.logLevel)
const app = createApp({ config, logger })

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info({ port: info.port }, 'listening')
})

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'shutting down')
  server.close(() => process.exit(0))
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
