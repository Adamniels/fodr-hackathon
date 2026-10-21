// Starts the API: `npm run dev` in development, `node dist/main.mjs` in the image (Dockerfile).
import { serve } from '@hono/node-server'
import { createAnthropicProvider } from './ai/anthropic'
import { createApp } from './app'
import { createAuth } from './auth'
import { parseConfig } from './config'
import { createDatabase } from './db'
import { createLogger } from './logger'
import { createSmtpMailer } from './mail/mailer'
import { horseRepository } from './repositories/horses'

const result = parseConfig(process.env)
if (!result.ok) {
  process.stderr.write(`${result.message}\n`)
  process.exit(1)
}
const { config } = result
const logger = createLogger(config.logLevel)
// The pool connects on the first query, so the API starts (and serves health) while the database is still coming up.
const database = createDatabase(config.databaseUrl)
const auth = createAuth({ config, database, mailer: createSmtpMailer(config), logger })
const app = createApp({
  config,
  logger,
  ai: createAnthropicProvider({ apiKey: config.anthropicApiKey }),
  auth,
  repositories: { horses: horseRepository(database.db) },
})

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info({ port: info.port }, 'listening')
})

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'shutting down')
  server.close(() => {
    void database.close().finally(() => process.exit(0))
  })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
