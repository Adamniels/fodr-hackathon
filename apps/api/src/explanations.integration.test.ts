// CF6 at API level (#32): a plan's AI explanation is stored for that saved plan, so showing the plan again never asks
// the model again; it is regenerated only on request, and a failure stores nothing and leaves the plan as it was. Only
// the plan's members reach it (ADR 0010). The provider is a fake; the database is real.
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { authApp, BASE_URL, signedInUser } from '../test/auth-app'
import type { FakeAiProvider } from '../test/fake-ai-provider'
import { EXPLANATION_REQUEST } from '../test/fixtures/ai'
import { COMPLETE } from '../test/fixtures/analyses'
import { SIXTEN } from '../test/fixtures/horses'
import { AiProviderError } from './ai/provider'
import { aiUsage, planExplanations } from './db/schema'

const harness = authApp()
const { app, database } = harness
const ai = harness.ai as FakeAiProvider
afterAll(harness.close)

beforeEach(() => {
  ai.reset()
  ai.answer('explainPlan', 'En förklaring.')
})

let ipCounter = 0
const nextIp = () => `10.32.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`

interface ExplanationBody {
  explanation: { text: string; createdAt: string } | null
}

async function savedPlan() {
  const { browser } = await signedInUser(app, nextIp())
  const horse = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
  const analysis = (await (await browser.post(`/api/v1/horses/${horse.id}/analyses`, { analys: COMPLETE })).json()) as {
    id: string
  }
  const { plan } = (await (
    await browser.post(`/api/v1/horses/${horse.id}/plans`, { analysisId: analysis.id })
  ).json()) as {
    plan: { id: string }
  }
  const path = `/api/v1/horses/${horse.id}/plans/${plan.id}/explanation`
  return {
    browser,
    horse,
    plan,
    path,
    read: async () => (await (await browser.request(path)).json()) as ExplanationBody,
    explain: (regenerate?: boolean) => browser.post(path, { request: EXPLANATION_REQUEST, regenerate }),
  }
}

describe('a plan explanation', () => {
  it('is written once for the plan, then read back without asking the model again', async () => {
    const { read, explain } = await savedPlan()
    expect(await read()).toEqual({ explanation: null })
    expect(ai.calls).toEqual([])

    const res = await explain()
    expect(res.status).toBe(200)
    const written = (await res.json()) as ExplanationBody
    expect(written.explanation).toMatchObject({ text: 'En förklaring.' })
    expect(ai.calls).toEqual([{ method: 'explainPlan', input: EXPLANATION_REQUEST }])

    // Asked again, from another visit or a second render, the stored text answers.
    expect(await (await explain()).json()).toEqual(written)
    expect(await read()).toEqual(written)
    expect(ai.calls).toHaveLength(1)
  })

  it('is written once when asked for several times together', async () => {
    const { explain } = await savedPlan()
    const answers = await Promise.all(Array.from({ length: 5 }, () => explain()))
    expect(answers.map((r) => r.status)).toEqual([200, 200, 200, 200, 200])
    expect(ai.calls).toHaveLength(1)
  })

  it('is replaced when regenerated, and the call counts against the quota', async () => {
    const { browser, read, explain } = await savedPlan()
    await explain()
    ai.answer('explainPlan', 'En ny förklaring.')
    const res = await explain(true)
    expect(((await res.json()) as ExplanationBody).explanation).toMatchObject({ text: 'En ny förklaring.' })
    expect((await read()).explanation).toMatchObject({ text: 'En ny förklaring.' })
    expect(ai.calls).toHaveLength(2)
    const me = (await (await browser.request('/api/v1/me')).json()) as { user: { id: string } }
    const usage = await database.db.select().from(aiUsage).where(eq(aiUsage.userId, me.user.id))
    expect(usage.map((u) => u.route)).toEqual(['explanation', 'explanation'])
  })

  it('stores nothing when the AI fails, and a failed regeneration keeps the text there was', async () => {
    const { read, explain } = await savedPlan()
    ai.fail('explainPlan', new AiProviderError('upstream', 500))
    const failed = await explain()
    expect(failed.status).toBe(502)
    expect(await failed.json()).toMatchObject({ code: 'ai.unavailable' })
    expect(await read()).toEqual({ explanation: null })

    ai.reset()
    ai.answer('explainPlan', 'En förklaring.')
    await explain()
    ai.fail('explainPlan', new AiProviderError('upstream', 500))
    expect((await explain(true)).status).toBe(502)
    expect((await read()).explanation).toMatchObject({ text: 'En förklaring.' })
  })

  it('passes the contract fields to the provider, and nothing else', async () => {
    const { browser, path } = await savedPlan()
    const res = await browser.post(path, {
      request: { ...EXPLANATION_REQUEST, utanforKontraktet: 'skicka inte vidare' },
    })
    expect(res.status).toBe(200)
    expect(ai.calls).toEqual([{ method: 'explainPlan', input: EXPLANATION_REQUEST }])
  })

  it('refuses a request without a session, and a body over 64 KB, without asking the model', async () => {
    const { browser, path } = await savedPlan()
    const anonymous = await app.request(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify({ request: EXPLANATION_REQUEST }),
    })
    expect(anonymous.status).toBe(401)
    const huge = await browser.post(path, { request: EXPLANATION_REQUEST, extra: 'x'.repeat(70 * 1024) })
    expect(huge.status).toBe(413)
    expect(ai.calls).toEqual([])
  })

  it('refuses a request the contract does not allow, without asking the model', async () => {
    const { browser, path } = await savedPlan()
    expect((await browser.post(path, { request: { hast: 'Sixten' } })).status).toBe(400)
    expect((await browser.post(path, {})).status).toBe(400)
    expect(ai.calls).toEqual([])
  })

  it("is 404 for another user's plan, and for a plan under another horse", async () => {
    const { horse, path } = await savedPlan()
    const { browser: other } = await signedInUser(app, nextIp())
    expect((await other.request(path)).status).toBe(404)
    expect((await other.post(path, { request: EXPLANATION_REQUEST })).status).toBe(404)

    const mine = await savedPlan()
    const elsewhere = mine.path.replace(mine.horse.id, horse.id)
    expect((await mine.browser.request(elsewhere)).status).toBe(404)
    const missing = mine.path.replace(mine.plan.id, '00000000-0000-4000-8000-000000000000')
    expect((await mine.browser.post(missing, { request: EXPLANATION_REQUEST })).status).toBe(404)
    expect((await mine.browser.request(mine.path.replace(mine.plan.id, 'not-a-uuid'))).status).toBe(404)
    expect(ai.calls).toEqual([])
  })

  it('goes with its plan', async () => {
    const { browser, horse, plan, explain } = await savedPlan()
    await explain()
    await browser.request(`/api/v1/horses/${horse.id}`, { method: 'DELETE' })
    expect(await database.db.select().from(planExplanations).where(eq(planExplanations.planId, plan.id))).toEqual([])
  })
})
