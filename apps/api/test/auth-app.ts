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
import { fakeAiProvider } from './fake-ai-provider'

export const BASE_URL = 'http://localhost:3000'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: inject('databaseUrl'),
    port: 3000,
    logLevel: 'silent',
    webDistDir: undefined,
    anthropicApiKey: undefined,
    betterAuthSecret: 'test-secret-that-is-at-least-32-characters',
    betterAuthUrl: BASE_URL,
    smtpHost: '127.0.0.1',
    smtpPort: Number(process.env.SMTP_PORT ?? '1025'),
    smtpUser: undefined,
    smtpPassword: undefined,
    mailFrom: 'Fodr <no-reply@fodr.test>',
    // The tests stand in for a trusted proxy that sets x-forwarded-for, so each test client can have its own IP.
    clientIpHeader: 'x-forwarded-for',
    ...overrides,
  }
}

export function authApp(overrides: Partial<Config> = {}) {
  const config = testConfig(overrides)
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
  const app = createApp({ config, logger, ai: fakeAiProvider(), auth })
  return { app, database, logs, close: () => database.close() }
}

/** A browser-like client: one IP (rate limits key on it), and the cookies the API set. */
export function client(app: ReturnType<typeof authApp>['app'], ip: string, baseUrl = BASE_URL) {
  const cookies = new Map<string, string>()
  async function request(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    const headers: Record<string, string> = { 'x-forwarded-for': ip, origin: baseUrl }
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    if (cookies.size > 0) headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const res = await app.request(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
  return { request, cookies, post: (path: string, body: unknown) => request(path, { method: 'POST', body }) }
}
