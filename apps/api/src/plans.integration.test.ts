// CF5 at API level (#27): plans are computed and stored by the server (ADR 0004), immutably, with the engine and
// catalogue versions, from a horse and an analysis the user can reach (ADR 0010). The catalogue is public.
import { skapaPlan } from '@fodr/domain/plan'
import type { Produkt } from '@fodr/domain/types'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { authApp, BASE_URL, signedInUser } from '../test/auth-app'
import { COMPLETE } from '../test/fixtures/analyses'
import { SIXTEN } from '../test/fixtures/horses'
import { plans } from './db/schema'

const { app, database, close } = authApp()
afterAll(close)

let ipCounter = 0
const nextIp = () => `10.27.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`

interface SavedPlanBody {
  id: string
  horseId: string
  analysisId: string
  inputs: { profil: Record<string, unknown>; analys: unknown }
  result: unknown
  engineVersion: string
  productSetVersion: string
}

async function catalogue() {
  const res = await app.request(`${BASE_URL}/api/v1/products`)
  return { res, body: (await res.json()) as { version: string; products: Produkt[] } }
}

async function horseWithAnalysis(profile = SIXTEN) {
  const { browser } = await signedInUser(app, nextIp())
  const horse = (await (await browser.post('/api/v1/horses', profile)).json()) as { id: string }
  const analysis = (await (await browser.post(`/api/v1/horses/${horse.id}/analyses`, { analys: COMPLETE })).json()) as {
    id: string
  }
  return { browser, horse, analysis, plans: `/api/v1/horses/${horse.id}/plans` }
}

describe('the product catalogue', () => {
  it('is public, with its version as the ETag', async () => {
    const { res, body } = await catalogue()
    expect(res.status).toBe(200)
    expect(body.version).toMatch(/^[0-9a-f]{16}$/)
    expect(body.products.length).toBeGreaterThan(100)
    expect(res.headers.get('etag')).toBe(`"${body.version}"`)
  })

  it('answers 304 to a browser that has this version', async () => {
    const { body } = await catalogue()
    const res = await app.request(`${BASE_URL}/api/v1/products`, { headers: { 'if-none-match': `"${body.version}"` } })
    expect(res.status).toBe(304)
  })
})

describe('saving a plan', () => {
  it('computes the plan on the server, as the preview does for the same inputs, and stores it', async () => {
    const { browser, horse, analysis, plans: path } = await horseWithAnalysis()
    expect(await (await browser.request(`${path}/latest`)).json()).toEqual({ plan: null })

    const res = await browser.post(path, { analysisId: analysis.id })
    expect(res.status).toBe(201)
    const saved = (await res.json()) as SavedPlanBody
    const { body: served } = await catalogue()

    // The browser previews with the same engine over the catalogue it was served (ADR 0004).
    const preview = skapaPlan({ ...SIXTEN, id: horse.id }, COMPLETE, served.products)
    expect('plan' in preview).toBe(true)
    if ('plan' in preview) expect(saved.result).toEqual(JSON.parse(JSON.stringify(preview.plan)))
    expect(saved).toMatchObject({
      horseId: horse.id,
      analysisId: analysis.id,
      inputs: { profil: { ...SIXTEN, id: horse.id }, analys: COMPLETE },
      engineVersion: 'test-build',
      productSetVersion: served.version,
    })
    expect(await (await browser.request(`${path}/latest`)).json()).toEqual({ plan: saved })
  })

  it('returns the newest as the latest', async () => {
    const { browser, analysis, plans: path } = await horseWithAnalysis()
    await browser.post(path, { analysisId: analysis.id })
    const second = (await (await browser.post(path, { analysisId: analysis.id })).json()) as SavedPlanBody
    const latest = (await (await browser.request(`${path}/latest`)).json()) as { plan: SavedPlanBody }
    expect(latest.plan.id).toBe(second.id)
  })

  it('stores nothing for input the engine refuses, and says which fields', async () => {
    const { browser, horse, analysis, plans: path } = await horseWithAnalysis({ ...SIXTEN, viktKg: 0 })
    const res = await browser.post(path, { analysisId: analysis.id })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      code: 'plan.invalid_input',
      errors: [{ path: 'viktKg', code: 'validation.range' }],
    })
    expect(await database.db.select().from(plans).where(eq(plans.horseId, horse.id))).toEqual([])
  })

  it("is 404 for another user's horse, and for an analysis of another horse", async () => {
    const { analysis, plans: path } = await horseWithAnalysis()
    const { browser: other } = await signedInUser(app, nextIp())
    expect((await other.post(path, { analysisId: analysis.id })).status).toBe(404)
    expect((await other.request(`${path}/latest`)).status).toBe(404)

    const mine = await horseWithAnalysis()
    const res = await mine.browser.post(mine.plans, { analysisId: analysis.id })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'analysis.not_found' })
  })

  it('refuses a body without an analysis ID', async () => {
    const { browser, plans: path } = await horseWithAnalysis()
    expect((await browser.post(path, {})).status).toBe(400)
  })

  it('cannot be changed once saved', async () => {
    const { browser, analysis, plans: path } = await horseWithAnalysis()
    const saved = (await (await browser.post(path, { analysisId: analysis.id })).json()) as SavedPlanBody
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      expect((await browser.request(`${path}/${saved.id}`, { method, body: {} })).status).toBe(404)
    }
  })

  it('goes with its horse', async () => {
    const { browser, horse, analysis, plans: path } = await horseWithAnalysis()
    await browser.post(path, { analysisId: analysis.id })
    await browser.request(`/api/v1/horses/${horse.id}`, { method: 'DELETE' })
    expect(await database.db.select().from(plans).where(eq(plans.horseId, horse.id))).toEqual([])
  })
})
