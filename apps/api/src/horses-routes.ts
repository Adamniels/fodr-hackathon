// The horse routes (#24, CF2): /api/v1/horses. Signed-in users only; data only through the repositories, which take
// the user (ADR 0010). Not found and not yours are both 404. Deleting a horse deletes its stored reports too (ADR 0011).
import { HorseProfileSchema } from '@fodr/contracts/horses'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv } from './app'
import type { Auth } from './auth'
import type { Logger } from './logger'
import { problem } from './problem'
import type { AnalysisRepository } from './repositories/analyses'
import type { HorseRepository } from './repositories/horses'
import { requireUser, type UserVariables } from './session'
import type { FileStore } from './storage'
import { parseJson } from './validation'

const MAX_BODY_BYTES = 64 * 1024

export interface HorseRouteDeps {
  auth: Auth
  files: FileStore
  logger: Logger
  horses: HorseRepository
  analyses: AnalysisRepository
}

export function horseRoutes({ auth, files, logger, horses, analyses }: HorseRouteDeps) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))
  // A profile is at most about 15 KB within the contract's caps; a larger body is refused before it is read whole.
  routes.use(bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => problem(c, 413, 'request.too_large') }))
  const notFound = (c: Parameters<typeof problem>[0]) => problem(c, 404, 'horse.not_found')

  routes.get('/', async (c) => c.json({ horses: await horses.listFor(c.get('user')) }))

  routes.post('/', async (c) => {
    const body = await parseJson(c, HorseProfileSchema)
    if (!body.ok) return body.response
    return c.json(await horses.create(c.get('user'), body.data), 201)
  })

  routes.get('/:id', async (c) => {
    const horse = await horses.get(c.get('user'), c.req.param('id'))
    return horse ? c.json(horse) : notFound(c)
  })

  routes.put('/:id', async (c) => {
    const body = await parseJson(c, HorseProfileSchema)
    if (!body.ok) return body.response
    const horse = await horses.update(c.get('user'), c.req.param('id'), body.data)
    return horse ? c.json(horse) : notFound(c)
  })

  routes.delete('/:id', async (c) => {
    const user = c.get('user')
    // The keys first: the rows cascade away with the horse.
    const keys = await analyses.fileKeys(user, c.req.param('id'))
    const removed = await horses.remove(user, c.req.param('id'))
    if (!removed) return notFound(c)
    try {
      await files.remove(keys)
    } catch (err) {
      // The horse is gone and nothing refers to the files any more; they are logged by count, never by content.
      logger.error({ requestId: c.get('requestId'), err, files: keys.length }, 'reports of a deleted horse remain')
    }
    return c.body(null, 204)
  })

  return routes
}
