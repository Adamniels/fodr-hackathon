// The HTTP app, built from its dependencies so tests can call it in memory (app.request). main.ts serves it.
import { getConnInfo } from '@hono/node-server/conninfo'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import { requestId, type RequestIdVariables } from 'hono/request-id'
import { MeResponseSchema } from '@fodr/contracts/me'
import { aiRoutes } from './ai/routes'
import type { AiProvider } from './ai/provider'
import type { Config } from './config'
import type { Logger } from './logger'
import { CLIENT_IP_HEADER, type Auth } from './auth'
import { analysisRoutes } from './analyses-routes'
import { horseRoutes } from './horses-routes'
import type { AnalysisRepository } from './repositories/analyses'
import type { HorseRepository } from './repositories/horses'
import type { FileStore } from './storage'
import { resolveClientIp } from './client-ip'
import { problem } from './problem'
import { requireUser } from './session'

export interface AppDeps {
  config: Config
  logger: Logger
  ai: AiProvider
  auth: Auth
  files: FileStore
  repositories: { horses: HorseRepository; analyses: AnalysisRepository }
}

export type AppEnv = { Variables: RequestIdVariables }

// A password reset token is part of Better Auth's path (/api/auth/reset-password/<token>); it never reaches the logs.
const loggedPath = (path: string) => path.replace(/^(\/api\/auth\/reset-password\/)[^/]+/, '$1[redacted]')

export function createApp({ config, logger, ai, auth, files, repositories }: AppDeps): Hono<AppEnv> {
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
        path: loggedPath(c.req.path),
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      'request',
    )
  })

  app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))
  // Better Auth's own routes: sign up, verify, sign in, sign out, password reset, magic link (ADR 0009). The client IP
  // its rate limits key on is resolved here and passed in CLIENT_IP_HEADER, replacing any value the client sent.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => {
    const headers = new Headers(c.req.raw.headers)
    headers.delete(CLIENT_IP_HEADER)
    const ip = clientIp(c, config.clientIpHeader)
    if (ip) headers.set(CLIENT_IP_HEADER, ip)
    return auth.handler(new Request(c.req.raw, { headers }))
  })
  app.get('/api/v1/me', requireUser(auth), (c) => c.json(MeResponseSchema.parse({ user: c.get('user') })))
  // Before the horse routes, whose body limit (64 KB) would otherwise refuse an uploaded report.
  const origin = new URL(config.betterAuthUrl).origin
  app.route('/api/v1/horses/:horseId/analyses', analysisRoutes({ origin, auth, ai, files, logger, ...repositories }))
  app.route('/api/v1/horses', horseRoutes({ auth, files, logger, ...repositories }))
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

/** The client IP from the trusted proxy header, else the connection (undefined without a socket, as in memory). */
function clientIp(c: Context<AppEnv>, trustedHeader: string | undefined): string | undefined {
  let socket: string | undefined
  try {
    socket = getConnInfo(c).remote.address
  } catch {
    socket = undefined
  }
  return resolveClientIp(trustedHeader ? c.req.header(trustedHeader) : undefined, socket)
}
