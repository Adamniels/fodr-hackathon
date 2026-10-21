// The AI routes moved from the Vite middleware (apps/web/server/apiPlugin.ts, #20) with the same paths, request and
// response shapes, statuses and error texts; the expected texts below are the ones that middleware sent.
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { fakeAiProvider } from '../../test/fake-ai-provider'
import { UNIT_CONFIG, unitAuth, unitRepositories } from '../../test/unit-deps'
import { createApp } from '../app'
import { createLogger } from '../logger'
import { AiProviderError } from './provider'

// The app with a fake provider and its log lines captured as parsed JSON.
function setup() {
  const ai = fakeAiProvider()
  const lines: Record<string, unknown>[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line) as never)
      done()
    },
  })
  const app = createApp({
    config: { ...UNIT_CONFIG, logLevel: 'info' },
    logger: createLogger('info', stream),
    ai,
    auth: unitAuth(),
    repositories: unitRepositories(),
  })
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  return { ai, app, post, lines }
}

const ROUTES = [
  { path: '/api/analys', method: 'readAnalysis', body: { mediaType: 'application/pdf', base64: 'JVBERi0=' } },
  {
    path: '/api/profil',
    method: 'interpretProfile',
    body: { foderText: 'Hö', halsaText: '', tidigareSvar: [], produkter: [{ id: 'p1', namn: 'Mineral' }] },
  },
  { path: '/api/forklaring', method: 'explainPlan', body: { behov: { energi: 70 } } },
  { path: '/api/journal', method: 'analyzeJournal', body: { poster: [{ datum: '2026-10-01', viktKg: 545 }] } },
] as const

describe('the AI routes', () => {
  it.each(ROUTES)('$path passes the request body to the provider unchanged', async ({ path, method, body }) => {
    const { ai, post } = setup()
    ai.answer(method, method === 'explainPlan' ? 'En förklaring.' : { ok: true })
    const res = await post(path, body)
    expect(res.status).toBe(200)
    expect(ai.calls).toEqual([{ method, input: body }])
  })

  it.each([
    ['/api/analys', 'readAnalysis'],
    ['/api/profil', 'interpretProfile'],
    ['/api/journal', 'analyzeJournal'],
  ] as const)('%s answers with the provider result as it is', async (path, method) => {
    const { ai, post } = setup()
    const result = { tsProcent: 84.2, anmarkningar: ['Oklart labb'], nested: { list: [1, null] } }
    ai.answer(method, result)
    const res = await post(path, {})
    expect(await res.json()).toEqual(result)
  })

  it('/api/forklaring answers with the text in { text }', async () => {
    const { ai, post } = setup()
    ai.answer('explainPlan', 'Grovfodret täcker energin.')
    const res = await post('/api/forklaring', {})
    expect(await res.json()).toEqual({ text: 'Grovfodret täcker energin.' })
  })

  it.each(ROUTES)('$path answers only POST', async ({ path }) => {
    const { ai, app } = setup()
    const res = await app.request(path)
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    expect(ai.calls).toEqual([])
  })
})

describe('AI route errors, as the Vite middleware sent them', () => {
  it.each([
    [
      new AiProviderError('missing_key'),
      500,
      'Ingen API-nyckel. Lägg ANTHROPIC_API_KEY i app/.env och starta om servern.',
    ],
    [new AiProviderError('auth'), 500, 'API-nyckeln saknas eller är ogiltig. Lägg den i app/.env.'],
    [new AiProviderError('rate_limit'), 429, 'För många anrop just nu. Vänta en stund och försök igen.'],
    [new AiProviderError('upstream', 529), 502, 'AI-tjänsten svarade med fel 529.'],
    [new AiProviderError('upstream'), 502, 'AI-tjänsten svarade med fel undefined.'],
    [new AiProviderError('refusal'), 500, 'Modellen avböjde att svara på förfrågan.'],
    [new AiProviderError('truncated'), 500, 'Svaret blev avklippt. Försök igen.'],
    [new Error('Unexpected reply shape'), 500, 'Unexpected reply shape'],
  ])('%s answers %i with its text', async (error, status, fel) => {
    for (const { path, method } of ROUTES) {
      const { ai, post } = setup()
      ai.fail(method, error)
      const res = await post(path, {})
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ fel })
    }
  })

  it('answers a thrown value that is not an Error with 500 and Okänt fel', async () => {
    const { ai, post } = setup()
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test: a non-Error
    ai.explainPlan = () => Promise.reject('boom')
    const res = await post('/api/forklaring', {})
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ fel: 'Okänt fel' })
  })

  it('answers a body that is not JSON with 500 and the parse message', async () => {
    const { ai, post } = setup()
    const res = await post('/api/analys', '{not json')
    expect(res.status).toBe(500)
    const { fel } = (await res.json()) as { fel: string }
    expect(fel).toBe(errorMessage(() => JSON.parse('{not json')))
    expect(ai.calls).toEqual([])
  })

  it('answers a body over 20 MB with 500, and takes one of exactly 20 MB', async () => {
    const { ai, post } = setup()
    ai.answer('readAnalysis', { ok: true })
    const limit = 20 * 1024 * 1024
    const tooLarge = await post('/api/analys', JSON.stringify({ base64: 'a'.repeat(limit) }))
    expect(tooLarge.status).toBe(500)
    expect(await tooLarge.json()).toEqual({ fel: 'Filen är för stor (max 20 MB).' })
    const atLimit = JSON.stringify({ base64: 'a'.repeat(limit - 13) })
    expect(atLimit.length).toBe(limit)
    expect((await post('/api/analys', atLimit)).status).toBe(200)
  })
})

function errorMessage(run: () => unknown): string {
  try {
    run()
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('did not throw')
}

// What a failed AI request logs (ADR 0015): the request ID, the error type and kind, never the body, which holds the
// owner's text about the horse; a JSON parse message quotes the body.
describe('AI route error logs', () => {
  it('logs a failed request without the body', async () => {
    const { post, lines } = setup()
    const res = await post('/api/profil', '{"foderText": "hemlig-markor hosta')
    const warning = lines.find((l) => l.msg === 'ai request failed')
    expect(warning).toMatchObject({ requestId: res.headers.get('X-Request-Id'), errorType: 'SyntaxError' })
    expect(JSON.stringify(lines)).not.toMatch(/hemlig-markor/)
  })

  it('logs a provider error with its kind', async () => {
    const { ai, post, lines } = setup()
    ai.fail('readAnalysis', new AiProviderError('rate_limit'))
    await post('/api/analys', {})
    expect(lines.find((l) => l.msg === 'ai request failed')).toMatchObject({
      errorType: 'AiProviderError',
      kind: 'rate_limit',
    })
  })

  it('logs a body over the limit', async () => {
    const { post, lines } = setup()
    const res = await post('/api/analys', JSON.stringify({ base64: 'a'.repeat(20 * 1024 * 1024) }))
    expect(res.status).toBe(500)
    expect(lines.find((l) => l.msg === 'ai request failed')).toMatchObject({
      requestId: res.headers.get('X-Request-Id'),
      errorType: 'BodyLimit',
    })
  })
})
