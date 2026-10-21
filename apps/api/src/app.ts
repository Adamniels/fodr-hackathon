// The HTTP app, built from its dependencies so tests can call it in memory (app.request). main.ts serves it.
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { requestId, type RequestIdVariables } from 'hono/request-id'
import type { Config } from './config'
import type { Logger } from './logger'
import { problem } from './problem'

export interface AppDeps {
  config: Config
  logger: Logger
}

export type AppEnv = { Variables: RequestIdVariables }

export function createApp({ config, logger }: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  // X-Request-Id on every response; a valid incoming ID (from a proxy) is kept, anything else is replaced.
  app.use(requestId())
  app.use(async (c, next) => {
    const started = performance.now()
    await next()
    // The path only: a query string may hold personal data.
    logger.info(
      {
        requestId: c.get('requestId'),
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      'request',
    )
  })

  app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

  if (config.webDistDir) {
    const root = config.webDistDir
    const files = serveStatic({ root })
    // Client routes are the SPA's: any other GET gets index.html, so a reload keeps the page.
    const index = serveStatic({ root, path: 'index.html' })
    // /api paths never reach the web app, so an unknown API route stays a problem+json 404 from notFound.
    app.get('*', (c, next) => (c.req.path.startsWith('/api/') ? next() : files(c, next)))
    app.get('*', (c, next) => (c.req.path.startsWith('/api/') ? next() : index(c, next)))
  }

  app.notFound((c) => problem(c, 404, 'http.not_found'))
  app.onError((err, c) => {
    logger.error({ requestId: c.get('requestId'), err }, 'unexpected error')
    return problem(c, 500, 'http.internal_error')
  })
  return app
}
