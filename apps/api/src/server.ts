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
import { loadCatalogue } from './products'
import { analysisRepository } from './repositories/analyses'
import { horseRepository } from './repositories/horses'
import { usageRepository } from './repositories/ai-usage'
import { journalRepository } from './repositories/journal'
import { planRepository } from './repositories/plans'
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
  const database = createDatabase(config.databaseUrl, (err) => logger.warn({ err }, 'idle database connection lost'))
  const auth = createAuth({ config, database, mailer: createSmtpMailer(config), logger })
  const files = createFileStore(config.s3)
  // A local or test store gets its bucket here, in the background like the database: the API serves everything but
  // uploads while the store is unreachable.
  if (config.s3.createBucket) {
    files.ensureBucket().catch((err: unknown) => logger.warn({ err }, 'could not create the bucket at start'))
  }
  const app = createApp({
    config,
    logger,
    ai: createAi(config),
    auth,
    files,
    catalogue: loadCatalogue(),
    repositories: {
      horses: horseRepository(database.db),
      analyses: analysisRepository(database.db),
      plans: planRepository(database.db),
      journal: journalRepository(database.db),
      usage: usageRepository(database.db),
    },
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
