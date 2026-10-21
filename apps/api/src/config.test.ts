import { describe, expect, it } from 'vitest'
import { parseConfig } from './config'

const VALID = { DATABASE_URL: 'postgres://fodr:secret-password@localhost:5432/fodr' }

describe('parseConfig', () => {
  it('reads a valid environment and fills the defaults', () => {
    expect(parseConfig(VALID)).toEqual({
      ok: true,
      config: { databaseUrl: VALID.DATABASE_URL, port: 3000, logLevel: 'info', webDistDir: undefined },
    })
  })

  it('reads every variable when set', () => {
    const result = parseConfig({ ...VALID, PORT: '8080', LOG_LEVEL: 'debug', WEB_DIST_DIR: '/app/web' })
    expect(result).toEqual({
      ok: true,
      config: { databaseUrl: VALID.DATABASE_URL, port: 8080, logLevel: 'debug', webDistDir: '/app/web' },
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
    expect(parseConfig({ DATABASE_URL: '' })).toMatchObject({ ok: false })
  })

  it('lists every invalid variable in one message', () => {
    const result = parseConfig({ DATABASE_URL: 'mysql://x@localhost/fodr', PORT: 'abc', LOG_LEVEL: 'loud' })
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
})
