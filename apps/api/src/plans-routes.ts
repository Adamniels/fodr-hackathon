// The plan routes (#27, CF5): /api/v1/horses/:horseId/plans (the contract is in @fodr/contracts/plans). The server
// computes every saved plan with the domain engine and its own catalogue, from the horse and the analysis as stored
// (ADR 0004), and records the build and catalogue versions; the browser's preview is never trusted. Signed-in users
// only; data only through the repositories, which take the user (ADR 0010).
import { SavePlanSchema } from '@fodr/contracts/plans'
import { skapaPlan } from '@fodr/domain/plan'
import { validateJournalEntry } from '@fodr/domain/validation'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv } from './app'
import type { Auth } from './auth'
import type { Catalogue } from './products'
import { problem } from './problem'
import type { AnalysisRepository } from './repositories/analyses'
import type { HorseRepository } from './repositories/horses'
import type { PlanRepository } from './repositories/plans'
import { requireUser, type UserVariables } from './session'
import { parseJson } from './validation'

export interface PlanRouteDeps {
  auth: Auth
  catalogue: Catalogue
  /** The build that computes the plans (its git commit). */
  engineVersion: string
  horses: HorseRepository
  analyses: AnalysisRepository
  plans: PlanRepository
}

export function planRoutes({ auth, catalogue, engineVersion, horses, analyses, plans }: PlanRouteDeps) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))
  routes.use(bodyLimit({ maxSize: 4 * 1024, onError: (c) => problem(c, 413, 'request.too_large') }))
  type C = Context<AppEnv & { Variables: UserVariables }>
  const horseId = (c: C) => c.req.param('horseId') ?? ''
  const horseNotFound = (c: C) => problem(c, 404, 'horse.not_found')

  routes.get('/latest', async (c) => {
    const plan = await plans.latest(c.get('user'), horseId(c))
    return plan === undefined ? horseNotFound(c) : c.json({ plan })
  })

  routes.post('/', async (c) => {
    const body = await parseJson(c, SavePlanSchema)
    if (!body.ok) return body.response
    // A journal date that is no calendar day is refused before anything is computed or stored.
    if (body.data.journalDatum !== undefined) {
      const errors = validateJournalEntry({ datum: body.data.journalDatum })
      if (errors.length > 0) {
        return problem(
          c,
          400,
          'validation.invalid',
          errors.map((e) => ({ path: 'journalDatum', code: e.message.code })),
        )
      }
    }
    const user = c.get('user')
    const horse = await horses.get(user, horseId(c))
    if (!horse) return horseNotFound(c)
    const analysis = await analyses.get(user, horse.id, body.data.analysisId)
    if (!analysis) return problem(c, 404, 'analysis.not_found')

    const result = skapaPlan(horse, analysis.analys, catalogue.products)
    // A profile or analysis saved as a draft (out of range) gets no plan: the fields to fix, as the preview shows them.
    if ('errors' in result) {
      return problem(
        c,
        422,
        'plan.invalid_input',
        result.errors.map((e) => ({ path: e.field, code: e.message.code })),
      )
    }
    const saved = await plans.create(
      user,
      horse.id,
      {
        analysisId: analysis.id,
        inputs: { profil: horse, analys: analysis.analys },
        result: result.plan,
        engineVersion,
        productSetVersion: catalogue.version,
      },
      body.data.journalDatum,
    )
    return saved ? c.json(saved, 201) : horseNotFound(c)
  })

  return routes
}

/** GET /api/v1/products: the catalogue, public, revalidated by its version (ETag) rather than downloaded again. */
export function productRoutes(catalogue: Catalogue) {
  const routes = new Hono<AppEnv>()
  const etag = `"${catalogue.version}"`
  // Weak comparison (RFC 9110): a proxy may weaken the tag, and a client may send several.
  const matches = (header: string | undefined) =>
    header?.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag || tag.trim() === '*') ?? false
  routes.get('/', (c) => {
    c.header('ETag', etag)
    c.header('Cache-Control', 'no-cache')
    if (matches(c.req.header('If-None-Match'))) return c.body(null, 304)
    return c.json(catalogue)
  })
  return routes
}
