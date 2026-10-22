import { describe, expect, it } from 'vitest'
import { parseConfig, parseMigrationConfig } from './config'

const VALID = {
  DATABASE_URL: 'postgres://fodr:secret-password@localhost:5432/fodr',
  BETTER_AUTH_SECRET: 'a-dev-secret-of-at-least-32-characters',
  BETTER_AUTH_URL: 'http://localhost:5173',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Fodr <no-reply@fodr.local>',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_BUCKET: 'fodr',
  S3_ACCESS_KEY_ID: 'fodr',
  S3_SECRET_ACCESS_KEY: 'fodr-dev-secret',
}
const AUTH_AND_MAIL = {
  betterAuthSecret: VALID.BETTER_AUTH_SECRET,
  betterAuthUrl: VALID.BETTER_AUTH_URL,
  smtpHost: 'localhost',
  smtpPort: 1025,
  smtpUser: undefined,
  smtpPassword: undefined,
  mailFrom: VALID.MAIL_FROM,
  clientIpHeader: undefined,
  s3: {
    endpoint: VALID.S3_ENDPOINT,
    region: 'us-east-1',
    bucket: 'fodr',
    accessKeyId: 'fodr',
    secretAccessKey: VALID.S3_SECRET_ACCESS_KEY,
    createBucket: false,
  },
}

describe('parseConfig', () => {
  it('reads a valid environment and fills the defaults', () => {
    expect(parseConfig(VALID)).toEqual({
      ok: true,
      config: {
        databaseUrl: VALID.DATABASE_URL,
        port: 3000,
        logLevel: 'info',
        webDistDir: undefined,
        anthropicApiKey: undefined,
        ...AUTH_AND_MAIL,
      },
    })
  })

  it('reads every variable when set', () => {
    const result = parseConfig({
      ...VALID,
      PORT: '8080',
      LOG_LEVEL: 'debug',
      WEB_DIST_DIR: '/app/web',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'smtp-secret',
      CLIENT_IP_HEADER: 'Fly-Client-IP',
    })
    expect(result).toEqual({
      ok: true,
      config: {
        databaseUrl: VALID.DATABASE_URL,
        port: 8080,
        logLevel: 'debug',
        webDistDir: '/app/web',
        anthropicApiKey: 'sk-ant-test',
        ...AUTH_AND_MAIL,
        smtpUser: 'mailer',
        smtpPassword: 'smtp-secret',
        clientIpHeader: 'fly-client-ip',
      },
    })
  })

  it('refuses a missing DATABASE_URL and says so', () => {
    const result = parseConfig({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/DATABASE_URL is required/)
  })

  it('treats an empty value as missing, so `PORT=` in .env is not port 0', () => {
    const result = parseConfig({ ...VALID, PORT: '' })
    expect(result).toMatchObject({ ok: true, config: { port: 3000 } })
    expect(parseConfig({ ...VALID, DATABASE_URL: '' })).toMatchObject({ ok: false })
  })

  it('lists every invalid variable in one message', () => {
    const result = parseConfig({ ...VALID, DATABASE_URL: 'mysql://x@localhost/fodr', PORT: 'abc', LOG_LEVEL: 'loud' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/DATABASE_URL/)
      expect(result.message).toMatch(/PORT/)
      expect(result.message).toMatch(/LOG_LEVEL/)
    }
  })

  it('never repeats a value in the message, since the database URL holds a password', () => {
    const result = parseConfig({ DATABASE_URL: 'http://fodr:secret-password@localhost/fodr' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).not.toMatch(/secret-password/)
  })

  it('creates the bucket at start only when asked to (#26)', () => {
    const on = parseConfig({ ...VALID, S3_CREATE_BUCKET: 'true' })
    expect(on.ok && on.config.s3.createBucket).toBe(true)
    const wrong = parseConfig({ ...VALID, S3_CREATE_BUCKET: 'ja' })
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.message).toMatch(/S3_CREATE_BUCKET must be true or false/)
  })

  it('requires the auth, mail and file store settings (#22, #26)', () => {
    const result = parseConfig({ DATABASE_URL: VALID.DATABASE_URL })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      for (const name of [
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
        'SMTP_HOST',
        'SMTP_PORT',
        'MAIL_FROM',
        'S3_ENDPOINT',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ]) {
        expect(result.message).toMatch(new RegExp(`${name} is required`))
      }
    }
  })

  it('refuses a short auth secret and a base URL that is not http or https', () => {
    const result = parseConfig({ ...VALID, BETTER_AUTH_SECRET: 'too-short', BETTER_AUTH_URL: 'ftp://fodr.example' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/BETTER_AUTH_SECRET must be at least 32 characters/)
      expect(result.message).toMatch(/BETTER_AUTH_URL/)
      expect(result.message).not.toMatch(/too-short/)
    }
  })
})

describe('parseMigrationConfig', () => {
  it('needs only DATABASE_URL, so a release migration never holds the auth or mail secrets', () => {
    expect(parseMigrationConfig({ DATABASE_URL: VALID.DATABASE_URL })).toEqual({
      ok: true,
      config: { databaseUrl: VALID.DATABASE_URL },
    })
  })

  it('refuses a missing DATABASE_URL', () => {
    const result = parseMigrationConfig({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/DATABASE_URL is required/)
  })
})
