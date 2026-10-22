// The real app with real auth for integration tests: the test database (inject('databaseUrl')), mail to the Compose
// Mailpit, and a client that keeps the session cookie like a browser.
import { Writable } from 'node:stream'
import { inject } from 'vitest'
import { createAuth } from '../src/auth'
import { createApp } from '../src/app'
import type { Config } from '../src/config'
import { createDatabase } from '../src/db'
import { createLogger } from '../src/logger'
import { createSmtpMailer } from '../src/mail/mailer'
import type { AiProvider } from '../src/ai/provider'
import { analysisRepository } from '../src/repositories/analyses'
import { horseRepository } from '../src/repositories/horses'
import { usageRepository } from '../src/repositories/ai-usage'
import { journalRepository } from '../src/repositories/journal'
import { planRepository } from '../src/repositories/plans'
import { loadCatalogue } from '../src/products'
import { createFileStore, type FileStore } from '../src/storage'
import { fakeAiProvider } from './fake-ai-provider'
import { linkIn, waitForMail } from './mailpit'
import { testS3Config } from './s3'

export const BASE_URL = 'http://localhost:3000'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: inject('databaseUrl'),
    port: 3000,
    logLevel: 'silent',
    webDistDir: undefined,
    appVersion: 'test-build',
    anthropicApiKey: undefined,
    ai: { model: 'test-model', dailyCallsPerUser: 30, priceSekPerMtokInput: 30, priceSekPerMtokOutput: 150 },
    betterAuthSecret: 'test-secret-that-is-at-least-32-characters',
    betterAuthUrl: BASE_URL,
    smtpHost: '127.0.0.1',
    smtpPort: Number(process.env.SMTP_PORT ?? '1025'),
    smtpUser: undefined,
    smtpPassword: undefined,
    mailFrom: 'Fodr <no-reply@fodr.test>',
    // The tests stand in for a trusted proxy that sets x-forwarded-for, so each test client can have its own IP.
    clientIpHeader: 'x-forwarded-for',
    s3: testS3Config(),
    ...overrides,
  }
}

export function authApp(overrides: Partial<Config> = {}, deps: { ai?: AiProvider; files?: FileStore } = {}) {
  const config = testConfig(overrides)
  const files = createFileStore(config.s3)
  const ai = deps.ai ?? fakeAiProvider()
  const database = createDatabase(config.databaseUrl)
  // Every log line, raw, so a test can assert what never reaches the logs.
  const logs: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      logs.push(chunk.toString())
      done()
    },
  })
  const logger = createLogger('debug', stream)
  const auth = createAuth({ config, database, mailer: createSmtpMailer(config), logger })
  const app = createApp({
    config,
    logger,
    ai,
    auth,
    files: deps.files ?? files,
    catalogue: loadCatalogue(),
    repositories: {
      horses: horseRepository(database.db),
      analyses: analysisRepository(database.db),
      plans: planRepository(database.db),
      journal: journalRepository(database.db),
      usage: usageRepository(database.db),
    },
  })
  return { app, database, logs, ai, files, close: () => database.close() }
}

/** A browser-like client: one IP (rate limits key on it), and the cookies the API set. */
export function client(app: ReturnType<typeof authApp>['app'], ip: string, baseUrl = BASE_URL) {
  const cookies = new Map<string, string>()
  async function request(
    path: string,
    init: { method?: string; body?: unknown; form?: FormData } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { 'x-forwarded-for': ip, origin: baseUrl }
    // A form sets its own multipart content type, with the boundary.
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    if (cookies.size > 0) headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const res = await app.request(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      redirect: 'manual',
    })
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';')
      const index = pair.indexOf('=')
      const name = pair.slice(0, index)
      const value = pair.slice(index + 1)
      if (value === '' || /max-age=0/i.test(line)) cookies.delete(name)
      else cookies.set(name, value)
    }
    return res
  }
  return {
    request,
    cookies,
    post: (path: string, body: unknown) => request(path, { method: 'POST', body }),
    upload: (path: string, form: FormData) => request(path, { method: 'POST', form }),
  }
}

let accountCounter = 0

/** A signed-up, verified and signed-in user with a client of their own (signs up, then follows the mailed link). */
export async function signedInUser(app: ReturnType<typeof authApp>['app'], ip: string) {
  const email = `user${String(++accountCounter)}-${String(Date.now())}@example.se`
  const browser = client(app, ip)
  const res = await browser.post('/api/auth/sign-up/email', {
    name: 'Anna',
    email,
    password: 'hemligt-losenord-1',
    callbackURL: '/horses',
  })
  if (res.status !== 200) throw new Error(`Sign up failed: ${String(res.status)}`)
  const link = linkIn(await waitForMail(email))
  await browser.request(link.pathname + link.search)
  return { email, browser }
}
