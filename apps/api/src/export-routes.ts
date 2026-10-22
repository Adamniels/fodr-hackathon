// GET /api/v1/me/export (#40, CF8): everything the app holds about the signed-in user as one ZIP, streamed as it is
// written (export-archive.ts), so its size is bounded by the user's reports rather than by memory. One export at a time
// per user. A plain link starts it in the browser: when the session has ended, the browser shows the 401 rather than
// the app sending to /login, which is acceptable as a session renews while the app is in use.
import { Hono } from 'hono'
import type { AppEnv } from './app'
import type { Auth } from './auth'
import { exportArchive } from './export-archive'
import type { Logger } from './logger'
import { problem } from './problem'
import type { ExportRepository } from './repositories/export'
import { requireUser, type UserVariables } from './session'
import type { FileStore } from './storage'

export function exportRoutes({
  auth,
  exports,
  files,
  logger,
}: {
  auth: Auth
  exports: ExportRepository
  files: FileStore
  logger: Logger
}) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))
  // The users with an export under way, in this process.
  const running = new Set<string>()

  routes.get('/', async (c) => {
    const user = c.get('user')
    if (running.has(user.id)) return problem(c, 429, 'export.in_progress')
    running.add(user.id)
    const done = () => {
      running.delete(user.id)
    }
    try {
      const data = await exports.forUser(user)
      if (!data) {
        done()
        return problem(c, 401, 'auth.unauthenticated')
      }
      const archive = exportArchive(data, files, (report, err) => {
        logger.error({ requestId: c.get('requestId'), err, ...report }, 'a report of an export is missing')
      })
      // The lock is held until the archive has gone out, failed, or the browser gave up on it.
      const body = releasing(archive, done)
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
      return new Response(body, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="fodr-export-${today}.zip"`,
          'Cache-Control': 'no-store',
        },
      })
    } catch (err) {
      done()
      throw err
    }
  })

  return routes
}

/** The stream as it is, calling `release` once when it ends, fails or is cancelled. */
function releasing(stream: ReadableStream<Uint8Array>, release: () => void): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let released = false
  const once = () => {
    if (!released) {
      released = true
      release()
    }
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          once()
          controller.close()
        } else controller.enqueue(value)
      } catch (err) {
        once()
        controller.error(err)
      }
    },
    async cancel(reason) {
      once()
      await reader.cancel(reason)
    },
  })
}
