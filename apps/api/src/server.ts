// Starts the API with its dependencies: main.ts with the Anthropic provider, and the web app's e2e run
// (test/e2e-server.ts) with a fake one, so both start the same server.
import { serve } from '@hono/node-server'
import type { AiProvider } from './ai/provider'
import { createApp } from './app'
import { createAuth } from './auth'
import { parseConfig, type Config } from './config'
import { createDatabase } from './db'
import { createLogger, type Logger } from './logger'
import { createSmtpMailer } from './mail/mailer'
import { databaseCatalogue, NoCatalogue } from './products'
import { exportRepository } from './repositories/export'
import { accountRepository } from './repositories/accounts'
import { productRepository, type ProductRepository } from './repositories/products'
import { analysisRepository } from './repositories/analyses'
import { horseRepository } from './repositories/horses'
import { usageRepository } from './repositories/ai-usage'
import { journalRepository } from './repositories/journal'
import { explanationRepository } from './repositories/explanations'
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
  const files = createFileStore(config.s3)
  const auth = createAuth({ config, database, mailer: createSmtpMailer(config), logger, files })
  // A local or test store gets its bucket here, in the background like the database: the API serves everything but
  // uploads while the store is unreachable.
  if (config.s3.createBucket) {
    files.ensureBucket().catch((err: unknown) => logger.warn({ err }, 'could not create the bucket at start'))
  }
  const products = productRepository(database.db)
  void requireCatalogue(products, logger)
  const app = createApp({
    config,
    logger,
    ai: createAi(config),
    auth,
    files,
    catalogue: databaseCatalogue(products),
    repositories: {
      horses: horseRepository(database.db),
      analyses: analysisRepository(database.db),
      plans: planRepository(database.db),
      explanations: explanationRepository(database.db),
      journal: journalRepository(database.db),
      usage: usageRepository(database.db),
      products,
      exports: exportRepository(database.db),
      accounts: accountRepository(database.db),
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

// Errors a database coming up gives: refused or reset connections, an unknown host, and Postgres starting or shutting
// down (57P01 to 57P03). Anything else (a missing table: migrations not applied) will not clear by waiting.
const TRANSIENT = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
])
const isTransient = (e: unknown) => {
  const error = e as { code?: string; cause?: { code?: string } }
  return TRANSIENT.has(error.cause?.code ?? error.code ?? '')
}

/**
 * Exits when the database has no product catalogue (#35): a plan without products would leave out every supplement
 * without saying why. Checked in the background like everything that needs the database, so the API still starts (and
 * serves health) while the database comes up; it retries while the database cannot be reached, and exits on any other
 * error (a database without the product tables cannot serve plans either).
 */
export function requireCatalogue(
  products: Pick<ProductRepository, 'currentSetId'>,
  logger: Logger,
  {
    exit = (code: number): void => process.exit(code),
    retryMs = 2000,
  }: { exit?: (code: number) => void; retryMs?: number } = {},
): Promise<void> {
  const check = async (): Promise<void> => {
    try {
      if ((await products.currentSetId()) === null) {
        logger.fatal(new NoCatalogue().message)
        exit(1)
      }
    } catch (err) {
      if (!isTransient(err)) {
        logger.fatal({ err }, 'could not check the product catalogue')
        exit(1)
        return
      }
      logger.warn({ err }, 'could not check the product catalogue, retrying')
      await new Promise((resolve) => setTimeout(resolve, retryMs).unref())
      return check()
    }
  }
  return check()
}
