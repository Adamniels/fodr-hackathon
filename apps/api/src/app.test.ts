import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { DrizzleQueryError } from 'drizzle-orm'
import { DatabaseError } from 'pg'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import type { Config } from './config'
import { createLogger } from './logger'

const CONFIG: Config = {
  databaseUrl: 'postgres://fodr:fodr@localhost:5432/fodr',
  port: 3000,
  logLevel: 'info',
  webDistDir: undefined,
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The app with its log lines captured as parsed JSON.
function setup(config: Partial<Config> = {}) {
  const lines: Record<string, unknown>[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line) as never)
      done()
    },
  })
  const app = createApp({ config: { ...CONFIG, ...config }, logger: createLogger('info', stream) })
  return { app, lines }
}

describe('GET /api/v1/health', () => {
  it('answers 200 with a request ID header', async () => {
    const { app } = setup()
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(res.headers.get('X-Request-Id')).toMatch(UUID)
  })

  it('keeps a valid incoming request ID, so a proxy can trace the request', async () => {
    const { app } = setup()
    const res = await app.request('/api/v1/health', { headers: { 'X-Request-Id': 'proxy-abc_123' } })
    expect(res.headers.get('X-Request-Id')).toBe('proxy-abc_123')
  })

  it('replaces an incoming request ID with characters that could forge log lines', async () => {
    const { app } = setup()
    const res = await app.request('/api/v1/health', { headers: { 'X-Request-Id': 'a b"}' } })
    expect(res.headers.get('X-Request-Id')).toMatch(UUID)
  })

  it('logs one line per request with the request ID and no query string', async () => {
    const { app, lines } = setup()
    const res = await app.request('/api/v1/health?email=someone@example.com')
    const requestLines = lines.filter((l) => l.msg === 'request')
    expect(requestLines).toHaveLength(1)
    expect(requestLines[0]).toMatchObject({
      requestId: res.headers.get('X-Request-Id'),
      method: 'GET',
      path: '/api/v1/health',
      status: 200,
    })
    expect(typeof requestLines[0].durationMs).toBe('number')
    expect(JSON.stringify(lines)).not.toMatch(/someone@example\.com/)
  })
})

describe('problem+json errors', () => {
  it.each(['/api/v1/nope', '/api/nope', '/api', '/nope'])('answers an unknown route %s with 404', async (path) => {
    const { app } = setup()
    const res = await app.request(path)
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    const requestId = res.headers.get('X-Request-Id')
    expect(requestId).toMatch(UUID)
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'http.not_found',
      requestId,
    })
  })

  it('answers an unexpected error with 500 and the request ID, never the error message, and logs it', async () => {
    const { app, lines } = setup()
    app.get('/api/v1/boom', () => {
      throw new Error('connection to db-internal.example failed')
    })
    const res = await app.request('/api/v1/boom')
    expect(res.status).toBe(500)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    const requestId = res.headers.get('X-Request-Id')
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'http.internal_error',
      requestId,
    })
    expect(text).not.toMatch(/db-internal/)
    const errorLine = lines.find((l) => l.level === 50)
    expect(errorLine).toMatchObject({ requestId, err: { message: 'connection to db-internal.example failed' } })
    expect(lines.find((l) => l.msg === 'request')).toMatchObject({ requestId, status: 500 })
  })

  // A failed query carries its SQL and parameters, and Postgres puts row values in `detail`: personal data and health
  // notes, which never go to the logs (ADR 0015). What identifies the failure (the error type, the Postgres code and
  // constraint, the stack frames) is kept.
  function failedQuery() {
    const pgError = new DatabaseError('duplicate key value violates unique constraint "users_email_key"', 0, 'error')
    pgError.code = '23505'
    pgError.constraint = 'users_email_key'
    pgError.detail = 'Key (email)=(anna@example.se) already exists.'
    return new DrizzleQueryError(
      'insert into "users" ("email", "note") values ($1, $2)',
      ['anna@example.se', 'fang 2025'],
      pgError,
    )
  }

  it.each([
    ['a failed query', failedQuery],
    ['an error caused by a failed query', () => new Error('saving the horse failed', { cause: failedQuery() })],
  ])('logs %s without its SQL, parameters or row values', async (_name, error) => {
    const { app, lines } = setup()
    app.get('/api/v1/boom', () => {
      throw error()
    })
    const res = await app.request('/api/v1/boom')
    expect(res.status).toBe(500)
    const logged = JSON.stringify(lines)
    expect(logged).not.toMatch(/anna@example\.se|fang 2025|insert into/)
    expect(logged).toMatch(/DrizzleQueryError/)
    expect(logged).toMatch(/23505/)
    expect(logged).toMatch(/users_email_key/)
    expect(logged).toMatch(/app\.test\.ts/)
  })
})

describe('the web app from WEB_DIST_DIR', () => {
  function webDist() {
    const dir = mkdtempSync(join(tmpdir(), 'fodr-web-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Fodr</title>')
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)')
    return dir
  }

  it('serves index.html at the root', async () => {
    const { app } = setup({ webDistDir: webDist() })
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/<title>Fodr<\/title>/)
  })

  it('serves a built file', async () => {
    const { app } = setup({ webDistDir: webDist() })
    const res = await app.request('/assets/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('serves index.html for a client route, so a reload keeps the page', async () => {
    const { app } = setup({ webDistDir: webDist() })
    const res = await app.request('/horses/123')
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/<title>Fodr<\/title>/)
  })

  it.each(['/api/v1/nope', '/api'])('still answers the unknown API route %s with problem+json', async (path) => {
    const { app } = setup({ webDistDir: webDist() })
    const res = await app.request(path)
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
  })

  // A stale index.html asking for an asset from an older build must get a 404, not HTML served as JavaScript.
  it.each(['/assets/missing.js', '/favicon.ico'])('answers a missing file %s with 404', async (path) => {
    const { app } = setup({ webDistDir: webDist() })
    const res = await app.request(path)
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
  })

  it.each(['/', '/horses/123'])('has index.html at %s revalidated, so a deploy reaches the browser', async (path) => {
    const { app } = setup({ webDistDir: webDist() })
    const res = await app.request(path)
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('lets the browser keep a built asset, whose name changes with its content', async () => {
    const { app } = setup({ webDistDir: webDist() })
    const res = await app.request('/assets/app.js')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })
})
