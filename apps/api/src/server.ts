// Starts the API with its dependencies: main.ts with the Anthropic provider, and the web app's e2e run
// (test/e2e-server.ts) with a fake one, so both start the same server.
import { serve } from '@hono/node-server'
import type { AiProvider } from './ai/provider'
import { createApp } from './app'
import { createAuth } from './auth'
import { parseConfig, type Config } from './config'
import { createDatabase } from './db'
import { createLogger } from './logger'
import { createSmtpMailer } from './mail/mailer'
import { analysisRepository } from './repositories/analyses'
import { horseRepository } from './repositories/horses'
import { createFileStore } from './storage'

export function runServer(createAi: (config: Config) => AiProvider): void {
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
  const files = createFileStore(config.s3)
  // In the background, like the database: the API serves everything but uploads while the store is unreachable.
  files.ensureBucket().catch((err: unknown) => logger.warn({ err }, 'file store unreachable at start'))
  const app = createApp({
    config,
    logger,
    ai: createAi(config),
    auth,
    files,
    repositories: { horses: horseRepository(database.db), analyses: analysisRepository(database.db) },
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
}
