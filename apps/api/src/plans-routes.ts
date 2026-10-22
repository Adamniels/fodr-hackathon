// The plan routes (#27, CF5): /api/v1/horses/:horseId/plans (the contract is in @fodr/contracts/plans). The server
// computes every saved plan with the domain engine and its own catalogue, from the horse and the analysis as stored
// (ADR 0004), and records the build and catalogue versions; the browser's preview is never trusted. Signed-in users
// only; data only through the repositories, which take the user (ADR 0010). A saved plan's AI explanation is stored with
// it (#32, CF6): written once, read back on every later visit, and written again only on request.
import { ExplainPlanSchema, SavePlanSchema } from '@fodr/contracts/plans'
import { skapaPlan } from '@fodr/domain/plan'
import { validateJournalEntry } from '@fodr/domain/validation'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { MeteredAi } from './ai/metered'
import { aiFailure } from './ai/routes'
import type { AppEnv } from './app'
import type { Auth } from './auth'
import type { Logger } from './logger'
import type { Catalogue } from './products'
import { problem } from './problem'
import type { AnalysisRepository } from './repositories/analyses'
import type { Explanation, ExplanationRepository } from './repositories/explanations'
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
  explanations: ExplanationRepository
  ai: MeteredAi
  logger: Logger
}

// A save names an analysis and a date. An explanation request is the plan as the page shows it, a few KB.
const MAX_SAVE_BYTES = 4 * 1024
const MAX_EXPLAIN_BYTES = 64 * 1024

export function planRoutes({
  auth,
  catalogue,
  engineVersion,
  horses,
  analyses,
  plans,
  explanations,
  ai,
  logger,
}: PlanRouteDeps) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))
  const limit = (maxSize: number) => bodyLimit({ maxSize, onError: (c) => problem(c, 413, 'request.too_large') })
  type C = Context<AppEnv & { Variables: UserVariables }>
  const horseId = (c: C) => c.req.param('horseId') ?? ''
  const planId = (c: C) => c.req.param('planId') ?? ''
  const horseNotFound = (c: C) => problem(c, 404, 'horse.not_found')
  const planNotFound = (c: C) => problem(c, 404, 'plan.not_found')

  routes.get('/latest', async (c) => {
    const plan = await plans.latest(c.get('user'), horseId(c))
    return plan === undefined ? horseNotFound(c) : c.json({ plan })
  })

  routes.post('/', limit(MAX_SAVE_BYTES), async (c) => {
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
    if (!saved) return horseNotFound(c)
    // The newest plan, when it was computed from the same: already stored (#32).
    return c.json({ plan: saved.plan, entry: saved.entry }, saved.created ? 201 : 200)
  })

  routes.get('/:planId/explanation', async (c) => {
    const explanation = await explanations.get(c.get('user'), horseId(c), planId(c))
    return explanation === undefined ? planNotFound(c) : c.json({ explanation })
  })

  // The explanations being written, by plan: a request for a plan already being explained (a second render, another
  // tab) waits for that answer rather than asking the model again. In this process only; a second API instance could
  // ask once more, and the last answer is the one stored.
  const writing = new Map<string, Promise<Explanation | undefined>>()

  routes.post('/:planId/explanation', limit(MAX_EXPLAIN_BYTES), async (c) => {
    const body = await parseJson(c, ExplainPlanSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const [horse, plan] = [horseId(c), planId(c)]
    // Each request is checked for its own user before it may share an answer.
    if (!(await explanations.canReach(user, horse, plan))) return planNotFound(c)
    let answer = writing.get(plan)
    if (!answer) {
      answer = (async () => {
        if (!body.data.regenerate) {
          const stored = await explanations.get(user, horse, plan)
          if (stored) return stored
        }
        const text = await ai.run(user.id, 'explanation', (provider) => provider.explainPlan(body.data.request))
        return explanations.put(user, horse, plan, { text, model: ai.model })
      })().finally(() => writing.delete(plan))
      writing.set(plan, answer)
    }
    try {
      const explanation = await answer
      return explanation ? c.json({ explanation }) : planNotFound(c)
    } catch (e) {
      return aiFailure(c, e, logger, 'plan explanation failed')
    }
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
