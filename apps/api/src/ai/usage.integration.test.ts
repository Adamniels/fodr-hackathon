// AI usage and the daily quota (#31, spec 6.5, ADR 0015) at API level: every call that reaches the model is logged
// with its tokens and cost and counts against the user's quota; over it, nothing is sent. The provider is a fake; the
// database is real.
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { authApp, signedInUser } from '../../test/auth-app'
import { FAKE_USAGE, type FakeAiProvider } from '../../test/fake-ai-provider'
import { PDF, READING } from '../../test/fixtures/analyses'
import { SIXTEN } from '../../test/fixtures/horses'
import { PROFILE_REQUEST } from '../../test/fixtures/ai'
import { aiUsage, users } from '../db/schema'
import { AiProviderError } from './provider'

const LIMIT = 3
const harness = authApp({
  ai: { model: 'test-model', dailyCallsPerUser: LIMIT, priceSekPerMtokInput: 30, priceSekPerMtokOutput: 150 },
})
const { app, database } = harness
const ai = harness.ai as FakeAiProvider
afterAll(harness.close)

const PROFILE_ANSWER = { foljdfragor: [] }
beforeEach(() => {
  ai.reset()
  ai.answer('interpretProfile', PROFILE_ANSWER)
  ai.answer('readAnalysis', READING)
})

let ipCounter = 0
async function user() {
  const signedIn = await signedInUser(app, `10.31.0.${String(++ipCounter)}`)
  const [row] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, signedIn.email))
  return { ...signedIn, userId: row.id }
}
const ask = (browser: Awaited<ReturnType<typeof user>>['browser']) =>
  browser.post('/api/v1/ai/profile', PROFILE_REQUEST)
const rowsOf = (userId: string) => database.db.select().from(aiUsage).where(eq(aiUsage.userId, userId))

describe('the daily quota', () => {
  it('allows the daily number of calls, then answers 429 without calling the model', async () => {
    const { browser } = await user()
    for (let i = 0; i < LIMIT; i++) expect((await ask(browser)).status).toBe(200)
    const over = await ask(browser)
    expect(over.status).toBe(429)
    expect(await over.json()).toMatchObject({ code: 'ai.quota_exceeded' })
    expect(ai.calls).toHaveLength(LIMIT)
  })

  it('never lets parallel calls pass it together', async () => {
    const { browser, userId } = await user()
    const statuses = (await Promise.all(Array.from({ length: 6 }, () => ask(browser)))).map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(LIMIT)
    expect(statuses.filter((s) => s === 429)).toHaveLength(6 - LIMIT)
    expect(await rowsOf(userId)).toHaveLength(LIMIT)
  })

  it("is each user's own", async () => {
    const first = await user()
    for (let i = 0; i < LIMIT; i++) await ask(first.browser)
    const second = await user()
    expect((await ask(second.browser)).status).toBe(200)
  })

  it('counts a call that failed at the model, but not one refused before it', async () => {
    const { browser, userId } = await user()
    ai.fail('interpretProfile', new AiProviderError('upstream', 500))
    expect((await ask(browser)).status).toBe(502)
    expect((await browser.post('/api/v1/ai/profile', { foderText: 42 })).status).toBe(400)
    ai.fail('interpretProfile', new AiProviderError('missing_key'))
    expect((await ask(browser)).status).toBe(503)
    // A rejected key never reaches a model either: a wrong key must not use up everyone's quota for the day.
    ai.fail('interpretProfile', new AiProviderError('auth'))
    expect((await ask(browser)).status).not.toBe(200)
    const rows = await rowsOf(userId)
    expect(rows.map((r) => r.status)).toEqual(['failed'])
  })

  it('starts again at midnight in Sweden: a call made yesterday does not count', async () => {
    const { browser, userId } = await user()
    // Rows from just before today's start in Sweden, as many as the quota.
    for (let i = 0; i < LIMIT; i++) {
      await database.db.insert(aiUsage).values({
        userId,
        route: 'profile',
        model: 'test-model',
        status: 'ok',
        createdAt: sql`(date_trunc('day', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm') - interval '1 minute'`,
      })
    }
    expect((await ask(browser)).status).toBe(200)
  })

  it('counts the calls made since midnight in Sweden, which a UTC day would not', async () => {
    const { browser, userId } = await user()
    // Rows from just after today's start in Sweden, which is before the start of the UTC day.
    for (let i = 0; i < LIMIT; i++) {
      await database.db.insert(aiUsage).values({
        userId,
        route: 'profile',
        model: 'test-model',
        status: 'ok',
        createdAt: sql`(date_trunc('day', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm') + interval '1 second'`,
      })
    }
    expect((await ask(browser)).status).toBe(429)
  })

  it('counts the report reading of an analysis upload, and refuses it over the quota', async () => {
    const { browser, userId } = await user()
    const { id } = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
    const upload = () => {
      const form = new FormData()
      form.set('file', new File([PDF], 'analys.pdf', { type: 'application/pdf' }))
      return browser.upload(`/api/v1/horses/${id}/analyses`, form)
    }
    for (let i = 0; i < LIMIT; i++) expect((await upload()).status).toBe(201)
    const over = await upload()
    expect(over.status).toBe(429)
    expect(await over.json()).toMatchObject({ code: 'ai.quota_exceeded' })
    expect((await rowsOf(userId)).map((r) => r.route)).toEqual(['analysis', 'analysis', 'analysis'])
  })
})

describe('the usage log', () => {
  it('records each call with its route, model, tokens and estimated cost', async () => {
    const { browser, userId } = await user()
    await ask(browser)
    const [row] = await database.db
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), eq(aiUsage.route, 'profile')))
    expect(row).toMatchObject({
      model: 'test-model',
      status: 'ok',
      inputTokens: FAKE_USAGE.inputTokens,
      outputTokens: FAKE_USAGE.outputTokens,
      // 1000 × 30 + 200 × 150 SEK per million tokens.
      costSek: 0.06,
    })
  })

  it('records the tokens and cost of a reply the model refused', async () => {
    const { browser, userId } = await user()
    ai.fail('interpretProfile', new AiProviderError('refusal', undefined, { inputTokens: 2000, outputTokens: 100 }))
    await ask(browser)
    expect(await rowsOf(userId)).toMatchObject([
      // 2000 × 30 + 100 × 150 SEK per million tokens.
      { status: 'failed', inputTokens: 2000, outputTokens: 100, costSek: 0.075 },
    ])
  })

  it('goes with its user', async () => {
    const { browser, userId } = await user()
    await ask(browser)
    await database.db.delete(users).where(eq(users.id, userId))
    expect(await rowsOf(userId)).toEqual([])
  })
})
