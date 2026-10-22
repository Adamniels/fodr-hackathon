// The analysis routes (#26, CF4): /api/v1/horses/:horseId/analyses (the contract is in @fodr/contracts/analyses).
// Signed-in users only; data only through the repositories, which take the user (ADR 0010). An upload goes through
// the API (ADR 0011): the type is read from the file's own bytes, the size checked against that type's limit, and the
// same bytes go to the AI and to the file store. The AI only reads; the domain converts and validates.
import {
  ANALYSIS_FILE_LIMITS,
  CreateAnalysisSchema,
  ValuesSchema,
  type AnalysisMediaType,
} from '@fodr/contracts/analyses'
import { tillGrovfoderanalys } from '@fodr/domain/analysis'
import type { Grovfoderanalys } from '@fodr/domain/types'
import { validateAnalysis } from '@fodr/domain/validation'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { AiProviderError, type AiProvider } from './ai/provider'
import type { AppEnv } from './app'
import type { Auth } from './auth'
import type { Logger } from './logger'
import { problem } from './problem'
import type { AnalysisRepository } from './repositories/analyses'
import type { HorseRepository } from './repositories/horses'
import { requireUser, type UserVariables } from './session'
import type { FileStore } from './storage'
import { parseJson } from './validation'

// An upload may be the largest accepted file and the multipart framing around it; anything else is JSON of a few KB, held
// to the horse routes' limit. A larger body is refused before it is read.
const MAX_UPLOAD_BYTES = Math.max(...Object.values(ANALYSIS_FILE_LIMITS)) + 64 * 1024
const MAX_JSON_BYTES = 64 * 1024

const isMultipart = (c: Context) =>
  c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase() === 'multipart/form-data'

/** The type a file's first bytes show, or undefined for anything that is not a PDF or an accepted photo. */
export function mediaTypeOf(bytes: Uint8Array): AnalysisMediaType | undefined {
  const starts = (signature: number[], at = 0) => signature.every((b, i) => bytes[at + i] === b)
  const ascii = (text: string) => Array.from({ length: text.length }, (_, i) => text.charCodeAt(i))
  if (starts(ascii('%PDF-'))) return 'application/pdf'
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (starts(ascii('RIFF')) && starts(ascii('WEBP'), 8)) return 'image/webp'
  return undefined
}

// Text the AI read is capped like the contract caps it; a longer sampling date is no date.
const withinContract = (a: Grovfoderanalys): Grovfoderanalys => ({
  ...a,
  ...(a.labb !== undefined && { labb: a.labb.slice(0, 200) }),
  ...(a.provdatum !== undefined && a.provdatum.length > 40 && { provdatum: undefined }),
})

export interface AnalysisRouteDeps {
  /** The app's own origin, the only one an upload may come from. */
  origin: string
  auth: Auth
  ai: AiProvider
  files: FileStore
  logger: Logger
  horses: HorseRepository
  analyses: AnalysisRepository
}

export function analysisRoutes({ origin, auth, ai, files, logger, horses, analyses }: AnalysisRouteDeps) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireUser(auth))
  const uploadLimit = bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: (c) => problem(c, 413, 'analysis.too_large') })
  const jsonLimit = bodyLimit({ maxSize: MAX_JSON_BYTES, onError: (c) => problem(c, 413, 'request.too_large') })
  routes.use((c, next) => (isMultipart(c) ? uploadLimit(c, next) : jsonLimit(c, next)))
  type C = Context<AppEnv & { Variables: UserVariables }>
  const horseId = (c: C) => c.req.param('horseId') ?? ''
  const horseNotFound = (c: C) => problem(c, 404, 'horse.not_found')

  /** The domain's objections to the values, as a problem+json 400 (CF4), or undefined when it has none. */
  const refused = (c: C, analys: Grovfoderanalys) => {
    const errors = validateAnalysis(analys)
    if (errors.length === 0) return undefined
    return problem(
      c,
      400,
      'validation.invalid',
      errors.map((e) => ({ path: `analys.${e.field}`, code: e.message.code })),
    )
  }

  routes.get('/current', async (c) => {
    const analysis = await analyses.current(c.get('user'), horseId(c))
    return analysis === undefined ? horseNotFound(c) : c.json({ analysis })
  })

  routes.post('/', async (c) => {
    if (isMultipart(c)) return upload(c)
    const body = await parseJson(c, CreateAnalysisSchema)
    if (!body.ok) return body.response
    const invalid = refused(c, body.data.analys)
    if (invalid) return invalid
    const analysis = await analyses.create(c.get('user'), horseId(c), {
      values: { analys: body.data.analys, omrakningar: [] },
    })
    return analysis ? c.json(analysis, 201) : horseNotFound(c)
  })

  async function upload(c: C): Promise<Response> {
    // A form on another page can send multipart without asking first (it is a simple request, unlike JSON), with the
    // session cookie where SameSite allows it; only the app itself may upload. Browsers send Origin with every POST.
    if (c.req.header('Origin') !== origin) return problem(c, 403, 'request.forbidden_origin')
    const user = c.get('user')
    // The horse first, so a horse that is not the user's never costs an AI call.
    if (!(await horses.get(user, horseId(c)))) return horseNotFound(c)
    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) return problem(c, 400, 'validation.invalid', [{ path: 'file', code: 'required' }])
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mediaType = mediaTypeOf(bytes)
    if (!mediaType) return problem(c, 415, 'analysis.unsupported_type')
    if (bytes.length > ANALYSIS_FILE_LIMITS[mediaType]) return problem(c, 413, 'analysis.too_large')

    let reading: Awaited<ReturnType<AiProvider['readAnalysis']>>
    try {
      reading = await ai.readAnalysis({ mediaType, base64: Buffer.from(bytes).toString('base64') })
    } catch (e) {
      if (!(e instanceof AiProviderError)) throw e
      logger.warn({ requestId: c.get('requestId'), kind: e.kind, status: e.status }, 'analysis reading failed')
      return e.kind === 'rate_limit' ? problem(c, 429, 'ai.rate_limited') : problem(c, 502, 'ai.unavailable')
    }
    // Not an analysis, or no dry matter: the domain's code, and nothing is stored (CF4).
    const result = tillGrovfoderanalys(reading)
    if ('error' in result) return problem(c, 422, result.error.code)

    const key = await files.put(bytes, mediaType)
    try {
      const analysis = await analyses.create(user, horseId(c), {
        values: { analys: withinContract(result.analys), omrakningar: result.omrakningar },
        file: { key, mediaType },
        extracted: reading,
      })
      if (analysis) return c.json(analysis, 201)
    } catch (e) {
      await removeQuietly(c, key)
      throw e
    }
    // The horse was deleted while the report was read: its file goes too.
    await removeQuietly(c, key)
    return horseNotFound(c)
  }

  async function removeQuietly(c: C, key: string) {
    try {
      await files.remove([key])
    } catch (err) {
      logger.error({ requestId: c.get('requestId'), err }, 'an unsaved report could not be deleted')
    }
  }

  routes.put('/:analysisId/values', async (c) => {
    const body = await parseJson(c, ValuesSchema)
    if (!body.ok) return body.response
    const invalid = refused(c, body.data.analys)
    if (invalid) return invalid
    const analysis = await analyses.updateValues(c.get('user'), horseId(c), c.req.param('analysisId'), body.data)
    return analysis ? c.json(analysis) : problem(c, 404, 'analysis.not_found')
  })

  return routes
}
