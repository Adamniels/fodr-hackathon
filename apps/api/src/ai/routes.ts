// The AI routes (#30): /api/v1/ai/profile, /explanation and /journal (the contracts are in @fodr/contracts/ai).
// Signed-in users only. A body is read as JSON and validated before the provider is called, so only the contract's
// fields reach the model and anything malformed is a 400 that costs no call. A provider failure is a problem+json code
// (ADR 0013) the web translates (ADR 0014). Reports are read by the analysis upload (#26), not here.
import { ExplanationRequestSchema, JournalRequestSchema, ProfileRequestSchema } from '@fodr/contracts/ai'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { z } from 'zod'
import type { AppEnv } from '../app'
import type { Auth } from '../auth'
import type { Logger } from '../logger'
import { problem } from '../problem'
import { requireUser, type UserVariables } from '../session'
import { parseJson } from '../validation'
import { AiProviderError, type AiErrorKind, type AiProvider } from './provider'

// The largest request is a journal of a few hundred entries; the contract caps every field well inside this.
const MAX_BODY_BYTES = 64 * 1024

type C = Context<AppEnv & { Variables: UserVariables }>

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

export function aiRoutes({ auth, ai, logger }: { auth: Auth; ai: AiProvider; logger: Logger }) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))
  routes.use(bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => problem(c, 413, 'request.too_large') }))

  /** A route that validates its body with the schema, then answers with what `call` returns for it. */
  function route<S extends z.ZodType>(path: string, schema: S, call: (body: z.infer<S>) => Promise<unknown>) {
    routes.post(path, async (c: C) => {
      const body = await parseJson(c, schema)
      if (!body.ok) return body.response
      try {
        return c.json(await call(body.data))
      } catch (e) {
        if (!(e instanceof AiProviderError)) throw e
        // The kind only: the request holds the owner's text about the horse.
        logger.warn({ requestId: c.get('requestId'), kind: e.kind, status: e.status }, 'ai request failed')
        const failure = FAILURES[e.kind]
        return problem(c, failure.status, failure.code)
      }
    })
  }

  route('/profile', ProfileRequestSchema, (body) => ai.interpretProfile(body))
  route('/explanation', ExplanationRequestSchema, async (body) => ({ text: await ai.explainPlan(body) }))
  route('/journal', JournalRequestSchema, (body) => ai.analyzeJournal(body))
  return routes
}
