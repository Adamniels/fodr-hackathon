// The AI routes (#30): /api/v1/ai/profile and /journal (the contracts are in @fodr/contracts/ai). A plan's explanation
// is written for the saved plan, under the plan routes (#32).
// Signed-in users only. A body is read as JSON and validated before the provider is called, so only the contract's
// fields reach the model and anything malformed is a 400 that costs no call. A provider failure is a problem+json code
// (ADR 0013) the web translates (ADR 0014), with aiFailure, which the plan explanation answers with too. Reports are read
// by the analysis upload (#26), not here.
import { JournalRequestSchema, ProfileRequestSchema } from '@fodr/contracts/ai'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { z } from 'zod'
import type { AppEnv } from '../app'
import type { Auth } from '../auth'
import type { Logger } from '../logger'
import type { CatalogueSource } from '../products'
import { problem } from '../problem'
import { requireUser, type UserVariables } from '../session'
import { parseJson } from '../validation'
import { AiQuotaExceeded, type MeteredAi } from './metered'
import { AiProviderError, type AiErrorKind } from './provider'

// The profile is a few KB. A journal is up to AI_JOURNAL_ENTRIES_MAX entries of up to
// JOURNAL_TEXT_MAX characters, each with a plan snapshot: 100 × (about 4 KB of escaped text and 0.5 KB of fields).
const MAX_BODY_BYTES = 64 * 1024
const MAX_JOURNAL_BODY_BYTES = 512 * 1024

type C = Context<AppEnv & { Variables: UserVariables }>

/**
 * The answer to an AI call that failed: the quota, the provider's failure as its problem code, or a reply that could
 * not be read. Logs the kind or the error type only, never a message: the request and the reply hold the owner's text.
 */
export function aiFailure(c: C, e: unknown, logger: Logger, message: string) {
  // Today's calls are used: nothing was sent to the model (#31).
  if (e instanceof AiQuotaExceeded) return problem(c, 429, 'ai.quota_exceeded')
  if (e instanceof AiProviderError) {
    logger.warn({ requestId: c.get('requestId'), kind: e.kind, status: e.status }, message)
    const failure = FAILURES[e.kind]
    return problem(c, failure.status, failure.code)
  }
  // A reply that could not be read (not the promised shape): the service failed us, as far as the owner can tell.
  logger.warn({ requestId: c.get('requestId'), errorType: errorType(e) }, message)
  return problem(c, 502, 'ai.unavailable')
}

/** What a provider failure tells the web: missing configuration, a busy or failing service, a refusal, a cut reply. */
const FAILURES: Record<AiErrorKind, { status: 429 | 502 | 503; code: string }> = {
  missing_key: { status: 503, code: 'ai.not_configured' },
  // The key was rejected: the service is unusable for us, which the owner sees as unavailable; the log says why.
  auth: { status: 502, code: 'ai.unavailable' },
  rate_limit: { status: 429, code: 'ai.rate_limited' },
  upstream: { status: 502, code: 'ai.unavailable' },
  refusal: { status: 502, code: 'ai.refused' },
  truncated: { status: 502, code: 'ai.truncated' },
}

export function aiRoutes({
  auth,
  ai,
  logger,
  catalogue,
}: {
  auth: Auth
  ai: MeteredAi
  logger: Logger
  catalogue: CatalogueSource
}) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))
  const limit = (maxSize: number) =>
    bodyLimit({
      maxSize,
      onError: (c) => {
        logger.warn({ requestId: c.get('requestId'), errorType: 'BodyLimit' }, 'ai request failed')
        return problem(c, 413, 'request.too_large')
      },
    })

  /** A route that validates its body with the schema, then answers with what `call` returns for it. */
  function route<S extends z.ZodType>(
    path: string,
    maxBytes: number,
    schema: S,
    call: (userId: string, body: z.infer<S>) => Promise<unknown>,
  ) {
    routes.post(path, limit(maxBytes), async (c: C) => {
      const body = await parseJson(c, schema)
      if (!body.ok) return body.response
      try {
        return c.json(await call(c.get('user').id, body.data))
      } catch (e) {
        return aiFailure(c, e, logger, 'ai request failed')
      }
    })
  }

  route('/profile', MAX_BODY_BYTES, ProfileRequestSchema, async (userId, body) => {
    // The catalogue as it is now (#35), which the profile's feeds will be planned with; read first, so a database that
    // cannot answer costs no paid call.
    const known = new Set((await catalogue.current()).products.map((p) => p.id))
    const profile = await ai.run(userId, 'profile', (provider) => provider.interpretProfile(body))
    // A product is linked only when the catalogue has it (CF3, C8): an ID the model invented is an unknown feed, kept
    // with its name and dose for the owner to see and pick from the list.
    return {
      ...profile,
      nuvarandeFoder: profile.nuvarandeFoder.map((f) =>
        f.produktId !== null && known.has(f.produktId) ? f : { ...f, produktId: null },
      ),
    }
  })
  route('/journal', MAX_JOURNAL_BODY_BYTES, JournalRequestSchema, (userId, body) =>
    ai.run(userId, 'journal', (provider) => provider.analyzeJournal(body)),
  )
  return routes
}

function errorType(e: unknown): string {
  return e instanceof Error ? e.constructor.name : typeof e
}
