// The AI routes at API level (#30; the plan explanation is in explanations.integration.test.ts since #32): signed-in
// users only, requests validated with the shared contracts so only their fields reach the provider, and errors as
// problem+json codes (ADR 0013). The provider is a fake; auth is real.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { authApp, BASE_URL, signedInUser } from '../../test/auth-app'
import type { FakeAiProvider } from '../../test/fake-ai-provider'
import { JOURNAL_REQUEST, PROFILE_REQUEST, PROFILE_RESPONSE } from '../../test/fixtures/ai'
import { AiProviderError, type AiErrorKind } from './provider'

const harness = authApp()
const { app, logs } = harness
const ai = harness.ai as FakeAiProvider
afterAll(harness.close)

const JOURNAL_RESPONSE = {
  sammanfattning: 'Stabil vikt.',
  monster: [],
  veterinar: { behovs: false, skal: null },
  nastaSteg: ['Väg om en månad.'],
}

const ROUTES = [
  { path: '/api/v1/ai/profile', method: 'interpretProfile', body: PROFILE_REQUEST, answer: PROFILE_RESPONSE },
  { path: '/api/v1/ai/journal', method: 'analyzeJournal', body: JOURNAL_REQUEST, answer: JOURNAL_RESPONSE },
] as const

beforeEach(() => {
  ai.reset()
  for (const r of ROUTES) ai.answer(r.method, r.answer)
})

let ipCounter = 0
const user = () => signedInUser(app, `10.30.0.${String(++ipCounter)}`)

describe('the AI routes', () => {
  it.each(ROUTES)('$path refuses a request without a session, before the provider', async ({ path, body }) => {
    const res = await app.request(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(401)
    expect(ai.calls).toEqual([])
  })

  it.each(ROUTES)(
    '$path passes the contract fields to the provider, and nothing else',
    async ({ path, method, body }) => {
      const { browser } = await user()
      const res = await browser.post(path, { ...body, utanforKontraktet: 'skicka inte vidare' })
      expect(res.status).toBe(200)
      expect(ai.calls).toEqual([{ method, input: body }])
    },
  )

  it('answers each route with the provider result in the contract shape', async () => {
    const { browser } = await user()
    expect(await (await browser.post(ROUTES[0].path, PROFILE_REQUEST)).json()).toEqual(PROFILE_RESPONSE)
    expect(await (await browser.post(ROUTES[1].path, JOURNAL_REQUEST)).json()).toEqual(JOURNAL_RESPONSE)
  })

  it.each(ROUTES)('$path refuses a malformed body with 400 and the field, before the provider', async ({ path }) => {
    const { browser } = await user()
    const res = await browser.post(path, { foderText: 42 })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'validation.invalid' })
    expect(ai.calls).toEqual([])
  })

  it('links only the products the catalogue has: an ID the AI invented is an unknown feed (C8, #33)', async () => {
    const { browser } = await user()
    ai.answer('interpretProfile', {
      ...PROFILE_RESPONSE,
      nuvarandeFoder: [
        { produktId: 'gg-1235447', namn: 'Krafft Leisure Pellets', gramPerDag: 1000 },
        { produktId: 'pa-hittat-123', namn: 'Hemmablandning', gramPerDag: 200 },
      ],
    })
    const res = await browser.post(ROUTES[0].path, PROFILE_REQUEST)
    expect(res.status).toBe(200)
    expect(((await res.json()) as typeof PROFILE_RESPONSE).nuvarandeFoder).toEqual([
      { produktId: 'gg-1235447', namn: 'Krafft Leisure Pellets', gramPerDag: 1000 },
      { produktId: null, namn: 'Hemmablandning', gramPerDag: 200 },
    ])
  })

  it('refuses a text over its cap, and a body over 64 KB', async () => {
    const { browser } = await user()
    const long = await browser.post(ROUTES[0].path, { ...PROFILE_REQUEST, foderText: 'x'.repeat(4001) })
    expect(long.status).toBe(400)
    const huge = await browser.post(ROUTES[0].path, { ...PROFILE_REQUEST, extra: 'x'.repeat(70 * 1024) })
    expect(huge.status).toBe(413)
    expect(ai.calls).toEqual([])
  })

  it('takes a journal of the latest 100 full-length entries, and no more entries than that', async () => {
    const { browser } = await user()
    const entry = (i: number) => ({
      id: `e${String(i)}`,
      datum: '2026-10-01',
      viktKg: 545,
      text: 'å'.repeat(2000),
      plan: { analys: 'Hösilage, Labb, 2026-06-10', grovfoderKgPerDag: 16, produkter: [], kostnadPerManad: 88 },
    })
    const full = { ...JOURNAL_REQUEST, poster: Array.from({ length: 100 }, (_, i) => entry(i)) }
    expect((await browser.post(ROUTES[1].path, full)).status).toBe(200)
    const tooMany = { ...JOURNAL_REQUEST, poster: Array.from({ length: 101 }, (_, i) => ({ ...entry(i), text: 'x' })) }
    expect((await browser.post(ROUTES[1].path, tooMany)).status).toBe(400)
  })

  it('no longer has the analysis reading route (#26) or the explanation route (#32)', async () => {
    // Reports are read by the upload; a plan is explained under the plan routes, for the saved plan.
    const { browser } = await user()
    for (const path of ['/api/analys', '/api/profil', '/api/forklaring', '/api/journal', '/api/v1/ai/explanation']) {
      expect((await browser.post(path, {})).status).toBe(404)
    }
  })
})

describe('AI errors', () => {
  it.each<[AiErrorKind, number, string]>([
    ['missing_key', 503, 'ai.not_configured'],
    ['auth', 502, 'ai.unavailable'],
    ['rate_limit', 429, 'ai.rate_limited'],
    ['upstream', 502, 'ai.unavailable'],
    ['refusal', 502, 'ai.refused'],
    ['truncated', 502, 'ai.truncated'],
  ])('a provider error %s is %i %s', async (kind, status, code) => {
    const { browser } = await user()
    ai.fail('interpretProfile', new AiProviderError(kind, 500))
    const res = await browser.post(ROUTES[0].path, PROFILE_REQUEST)
    expect(res.status).toBe(status)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(await res.json()).toMatchObject({ code })
  })

  it('answers a reply that could not be read as unavailable, and logs only its type', async () => {
    const { browser } = await user()
    ai.fail('interpretProfile', new SyntaxError('Unexpected token in "hemlig-markor ur svaret"'))
    const res = await browser.post(ROUTES[0].path, PROFILE_REQUEST)
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ code: 'ai.unavailable' })
    const lines = logs.map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines.findLast((l) => l.msg === 'ai request failed')).toMatchObject({ errorType: 'SyntaxError' })
    expect(logs.join('\n')).not.toMatch(/hemlig-markor/)
  })

  it('logs a provider error with its kind, never the owner text', async () => {
    const { browser } = await user()
    ai.fail('interpretProfile', new AiProviderError('rate_limit'))
    await browser.post(ROUTES[0].path, { ...PROFILE_REQUEST, foderText: 'hemlig-markor hosta' })
    const lines = logs.map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines.findLast((l) => l.msg === 'ai request failed')).toMatchObject({ kind: 'rate_limit' })
    expect(logs.join('\n')).not.toMatch(/hemlig-markor/)
  })
})
