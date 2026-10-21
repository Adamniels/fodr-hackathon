// The HTTP app, built from its dependencies so tests can call it in memory (app.request). main.ts serves it.
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { requestId, type RequestIdVariables } from 'hono/request-id'
import { aiRoutes } from './ai/routes'
import type { AiProvider } from './ai/provider'
import type { Config } from './config'
import type { Logger } from './logger'
import { problem } from './problem'

export interface AppDeps {
  config: Config
  logger: Logger
  ai: AiProvider
}

export type AppEnv = { Variables: RequestIdVariables }

export function createApp({ config, logger, ai }: AppDeps): Hono<AppEnv> {
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
  // The AI routes keep their paths outside /api/v1 until #30 versions them.
  app.route('/api', aiRoutes(ai, logger))

  if (config.webDistDir) {
    const root = config.webDistDir
    const files = serveStatic({ root })
    const index = serveStatic({ root, path: 'index.html' })
    // /api paths never reach the web app, so an unknown API route stays a problem+json 404 from notFound.
    const isApi = (path: string) => path === '/api' || path.startsWith('/api/')
    // serveStatic returns a Response only when it found the file (otherwise what next() returns), so a 404 never gets
    // these cache headers. A directory such as / is left to the index route below.
    app.get('*', async (c, next) => {
      if (isApi(c.req.path) || c.req.path.endsWith('/')) return next()
      const res = await files(c, next)
      // Built assets have the content hash in their name, so the browser may keep them.
      if (res instanceof Response && c.req.path.startsWith('/assets/'))
        res.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      return res
    })
    // Client routes are the SPA's: any other GET gets index.html, so a reload keeps the page. A path with a file
    // extension is a file, so a missing one is a 404 rather than HTML (a stale page asking for an older build's asset).
    app.get('*', async (c, next) => {
      if (isApi(c.req.path) || /\.[^/]*$/.test(c.req.path)) return next()
      const res = await index(c, next)
      // Revalidated on every load, so a deploy reaches the browser.
      if (res instanceof Response) res.headers.set('Cache-Control', 'no-cache')
      return res
    })
  }

  app.notFound((c) => problem(c, 404, 'http.not_found'))
  app.onError((err, c) => {
    logger.error({ requestId: c.get('requestId'), err }, 'unexpected error')
    return problem(c, 500, 'http.internal_error')
  })
  return app
}
