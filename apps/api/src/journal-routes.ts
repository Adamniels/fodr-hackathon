// The journal routes (#28, CF7): /api/v1/horses/:horseId/journal (the contract is in @fodr/contracts/journal).
// Signed-in users only; data only through the repository, which takes the user (ADR 0010). The domain validates the
// date, weight and condition; a refused entry writes nothing, the profile neither.
import { NewJournalEntrySchema } from '@fodr/contracts/journal'
import { validateJournalEntry } from '@fodr/domain/validation'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv } from './app'
import type { Auth } from './auth'
import { problem } from './problem'
import type { JournalRepository } from './repositories/journal'
import { requireUser, type UserVariables } from './session'
import { parseJson } from './validation'

export function journalRoutes({ auth, journal }: { auth: Auth; journal: JournalRepository }) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))
  // An entry is at most the 2000-character text and a few fields.
  routes.use(bodyLimit({ maxSize: 16 * 1024, onError: (c) => problem(c, 413, 'request.too_large') }))
  type C = Context<AppEnv & { Variables: UserVariables }>
  const horseId = (c: C) => c.req.param('horseId') ?? ''
  const horseNotFound = (c: C) => problem(c, 404, 'horse.not_found')

  routes.get('/', async (c) => {
    const entries = await journal.list(c.get('user'), horseId(c))
    return entries ? c.json({ entries }) : horseNotFound(c)
  })

  routes.post('/', async (c) => {
    const body = await parseJson(c, NewJournalEntrySchema)
    if (!body.ok) return body.response
    const errors = validateJournalEntry(body.data)
    if (errors.length > 0) {
      return problem(
        c,
        400,
        'validation.invalid',
        errors.map((e) => ({ path: e.field, code: e.message.code })),
      )
    }
    const created = await journal.create(c.get('user'), horseId(c), body.data)
    return created ? c.json(created, 201) : horseNotFound(c)
  })

  return routes
}
