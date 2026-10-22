// Dependencies for unit tests of the app (no services): the config with dummy auth and mail settings, and a real
// Better Auth whose database is never reached, since unit tests make no request that needs a session or a write.
import { createAuth } from '../src/auth'
import type { Config } from '../src/config'
import { createDatabase } from '../src/db'
import { createLogger } from '../src/logger'
import { analysisRepository } from '../src/repositories/analyses'
import { horseRepository } from '../src/repositories/horses'
import { planRepository } from '../src/repositories/plans'
import type { FileStore } from '../src/storage'

export const UNIT_CONFIG: Config = {
  databaseUrl: 'postgres://fodr:fodr@127.0.0.1:1/unreachable',
  port: 3000,
  logLevel: 'info',
  webDistDir: undefined,
  appVersion: 'unit',
  anthropicApiKey: undefined,
  betterAuthSecret: 'unit-test-secret-of-at-least-32-characters',
  betterAuthUrl: 'http://localhost:3000',
  smtpHost: '127.0.0.1',
  smtpPort: 1025,
  smtpUser: undefined,
  smtpPassword: undefined,
  mailFrom: 'Fodr <no-reply@fodr.test>',
  clientIpHeader: undefined,
  s3: {
    endpoint: 'http://127.0.0.1:1',
    region: 'us-east-1',
    bucket: 'unreachable',
    accessKeyId: 'fodr',
    secretAccessKey: 'fodr-dev-secret',
    createBucket: false,
  },
}

export function unitAuth() {
  return createAuth({
    config: UNIT_CONFIG,
    database: createDatabase(UNIT_CONFIG.databaseUrl),
    mailer: { send: () => Promise.resolve() },
    logger: createLogger('silent'),
  })
}

/** Repositories over a database that is never reached. */
export function unitRepositories() {
  const { db } = createDatabase(UNIT_CONFIG.databaseUrl)
  return { horses: horseRepository(db), analyses: analysisRepository(db), plans: planRepository(db) }
}

/** A file store unit tests never reach. */
export const unitFiles: FileStore = {
  put: () => Promise.reject(new Error('no file store in unit tests')),
  remove: () => Promise.reject(new Error('no file store in unit tests')),
}
