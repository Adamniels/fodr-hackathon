// The AI routes, moved from the Vite middleware (apps/web/server/apiPlugin.ts) unchanged (#20): the same paths,
// request and response shapes, statuses and `{ fel }` error texts the web app shows. Requests are not validated
// beyond JSON parsing and errors are not problem+json yet; both come with #30.
import type { Context } from 'hono'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv } from '../app'
import type { Logger } from '../logger'
import { AiProviderError, type AiErrorKind, type AiProvider, type AnalysisFile, type ProfileInput } from './provider'

const MAX_BODY_BYTES = 20 * 1024 * 1024

/* eslint-disable no-restricted-syntax -- The texts the Vite middleware sent, kept identical in this refactor (#20).
   #30 replaces them with problem+json codes that the web app translates (ADR 0013, ADR 0014). */
const TOO_LARGE = 'Filen är för stor (max 20 MB).'
const UNKNOWN = 'Okänt fel'
const ERROR_TEXT: Record<Exclude<AiErrorKind, 'upstream'>, string> = {
  missing_key: 'Ingen API-nyckel. Lägg ANTHROPIC_API_KEY i app/.env och starta om servern.',
  auth: 'API-nyckeln saknas eller är ogiltig. Lägg den i app/.env.',
  rate_limit: 'För många anrop just nu. Vänta en stund och försök igen.',
  refusal: 'Modellen avböjde att svara på förfrågan.',
  truncated: 'Svaret blev avklippt. Försök igen.',
}
const upstreamText = (status: number | undefined) => `AI-tjänsten svarade med fel ${String(status)}.`
/* eslint-enable no-restricted-syntax */

const STATUS: Record<AiErrorKind, 429 | 500 | 502> = {
  missing_key: 500,
  auth: 500,
  rate_limit: 429,
  upstream: 502,
  refusal: 500,
  truncated: 500,
}

export function aiRoutes(ai: AiProvider, logger: Logger): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  const limit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => {
      logger.warn({ requestId: c.get('requestId'), errorType: 'BodyLimit' }, 'ai request failed')
      return c.json({ fel: TOO_LARGE }, 500)
    },
  })

  function route(path: string, handle: (body: unknown) => Promise<unknown>) {
    routes.post(path, limit, async (c) => {
      try {
        const body: unknown = JSON.parse(await c.req.text())
        return c.json(await handle(body))
      } catch (e) {
        // The type and kind only: a parse error quotes the body, and the body holds the owner's text about the horse.
        const kind = e instanceof AiProviderError ? e.kind : undefined
        logger.warn({ requestId: c.get('requestId'), errorType: errorType(e), kind }, 'ai request failed')
        return errorResponse(c, e)
      }
    })
  }

  route('/analys', (body) => ai.readAnalysis(body as AnalysisFile))
  route('/profil', (body) => ai.interpretProfile(body as ProfileInput))
  route('/forklaring', async (body) => ({ text: await ai.explainPlan(body) }))
  route('/journal', (body) => ai.analyzeJournal(body))
  return routes
}

function errorResponse(c: Context<AppEnv>, e: unknown): Response {
  if (e instanceof AiProviderError) {
    return c.json({ fel: e.kind === 'upstream' ? upstreamText(e.status) : ERROR_TEXT[e.kind] }, STATUS[e.kind])
  }
  return c.json({ fel: e instanceof Error ? e.message : UNKNOWN }, 500)
}

function errorType(e: unknown): string {
  return e instanceof Error ? e.constructor.name : typeof e
}
