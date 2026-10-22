// CF5 at API level (#27): plans are computed and stored by the server (ADR 0004), immutably, with the engine and
// catalogue versions, from a horse and an analysis the user can reach (ADR 0010). The catalogue is public.
import { skapaPlan } from '@fodr/domain/plan'
import type { Produkt } from '@fodr/domain/types'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { authApp, BASE_URL, signedInUser } from '../test/auth-app'
import { loadCatalogueFile } from './catalogue-file'
import { COMPLETE } from '../test/fixtures/analyses'
import { SIXTEN } from '../test/fixtures/horses'
import { horseMembers, plans } from './db/schema'
import { planRepository } from './repositories/plans'

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
    // The newest product set in the database (#35).
    expect(body.version).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.products.length).toBeGreaterThan(100)
    expect(res.headers.get('etag')).toBe(`"${body.version}"`)
  })

  it('answers 304 to a browser that has this version', async () => {
    const { body } = await catalogue()
    for (const tags of [`"${body.version}"`, `W/"${body.version}"`, `"other", "${body.version}"`]) {
      const res = await app.request(`${BASE_URL}/api/v1/products`, { headers: { 'if-none-match': tags } })
      expect(res.status).toBe(304)
    }
    const other = await app.request(`${BASE_URL}/api/v1/products`, { headers: { 'if-none-match': '"other"' } })
    expect(other.status).toBe(200)
  })
})

describe('saving a plan', () => {
  it('computes the plan on the server, as the preview does for the same inputs, and stores it', async () => {
    const { browser, horse, analysis, plans: path } = await horseWithAnalysis()
    expect(await (await browser.request(`${path}/latest`)).json()).toEqual({ plan: null })

    const res = await browser.post(path, { analysisId: analysis.id })
    expect(res.status).toBe(201)
    const { plan: saved, entry } = (await res.json()) as { plan: SavedPlanBody; entry: unknown }
    expect(entry).toBeNull()
    const { body: served } = await catalogue()

    // The browser previews with the same engine over the catalogue it was served (ADR 0004).
    const preview = skapaPlan({ ...SIXTEN, id: horse.id }, COMPLETE, served.products)
    expect('plan' in preview).toBe(true)
    if ('plan' in preview) expect(saved.result).toEqual(JSON.parse(JSON.stringify(preview.plan)))
    // And the same plan as from the catalogue file itself: moving the catalogue into the database changed no plan (#35).
    const fromFile = skapaPlan({ ...SIXTEN, id: horse.id }, COMPLETE, loadCatalogueFile())
    if ('plan' in fromFile) expect(saved.result).toEqual(JSON.parse(JSON.stringify(fromFile.plan)))
    else expect.fail('the catalogue file gives no plan')
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
    const { browser, horse, analysis, plans: path } = await horseWithAnalysis()
    await browser.post(path, { analysisId: analysis.id })
    await browser.request(`/api/v1/horses/${horse.id}`, { method: 'PUT', body: { ...SIXTEN, viktKg: 560 } })
    const second = ((await (await browser.post(path, { analysisId: analysis.id })).json()) as { plan: SavedPlanBody })
      .plan
    const latest = (await (await browser.request(`${path}/latest`)).json()) as { plan: SavedPlanBody }
    expect(latest.plan.id).toBe(second.id)
  })

  it('reuses the latest plan when nothing it was computed from changed (#32)', async () => {
    // The plan step saves the plan it shows; showing it again must not store it again.
    const { browser, horse, analysis, plans: path } = await horseWithAnalysis()
    const first = (await (await browser.post(path, { analysisId: analysis.id })).json()) as { plan: SavedPlanBody }
    const again = await browser.post(path, { analysisId: analysis.id })
    expect(again.status).toBe(200)
    expect(((await again.json()) as { plan: SavedPlanBody }).plan).toEqual(first.plan)
    expect(await database.db.select().from(plans).where(eq(plans.horseId, horse.id))).toHaveLength(1)
  })

  it('saves a new plan when the build or the catalogue that computed the latest one differs (#32)', async () => {
    const { browser, analysis, plans: path } = await horseWithAnalysis()
    for (const changed of [{ engineVersion: 'older-build' }, { productSetVersion: 'older-catalogue' }]) {
      const latest = (await (await browser.post(path, { analysisId: analysis.id })).json()) as { plan: SavedPlanBody }
      await database.db.update(plans).set(changed).where(eq(plans.id, latest.plan.id))
      const res = await browser.post(path, { analysisId: analysis.id })
      expect(res.status).toBe(201)
      expect(((await res.json()) as { plan: SavedPlanBody }).plan.id).not.toBe(latest.plan.id)
    }
  })

  it('stores one plan for identical saves made together (#32)', async () => {
    // At the repository: through HTTP each save computes its plan first, which spaces the saves out and hides a race.
    const { browser, horse, analysis, plans: path } = await horseWithAnalysis()
    await browser.post(path, { analysisId: analysis.id })
    // The plan as stored, saved again by five saves at once once it is gone.
    const [stored] = await database.db.delete(plans).where(eq(plans.horseId, horse.id)).returning()
    const [member] = await database.db.select().from(horseMembers).where(eq(horseMembers.horseId, horse.id))
    const repository = planRepository(database.db)
    // Open the connections first, so the saves run together rather than as each connection is made.
    await Promise.all(Array.from({ length: 5 }, () => database.db.execute(sql`select pg_sleep(0.05)`)))
    const saved = await Promise.all(
      Array.from({ length: 5 }, () =>
        repository.create({ id: member.userId }, horse.id, {
          analysisId: stored.analysisId,
          inputs: stored.inputs,
          result: stored.result,
          engineVersion: stored.engineVersion,
          productSetVersion: stored.productSetVersion,
        }),
      ),
    )
    expect(new Set(saved.map((s) => s?.plan.id)).size).toBe(1)
    expect(saved.filter((s) => s?.created)).toHaveLength(1)
    expect(await database.db.select().from(plans).where(eq(plans.horseId, horse.id))).toHaveLength(1)
  })

  it('adds the journal entry to the plan already saved, rather than saving it again (#32)', async () => {
    const { browser, horse, analysis, plans: path } = await horseWithAnalysis()
    const shown = (await (await browser.post(path, { analysisId: analysis.id })).json()) as { plan: SavedPlanBody }
    const res = await browser.post(path, { analysisId: analysis.id, journalDatum: '2026-10-22' })
    const { plan, entry } = (await res.json()) as { plan: SavedPlanBody; entry: { plan: { planId: string } } }
    expect(plan.id).toBe(shown.plan.id)
    expect(entry.plan.planId).toBe(shown.plan.id)
    expect(await database.db.select().from(plans).where(eq(plans.horseId, horse.id))).toHaveLength(1)
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
    const saved = ((await (await browser.post(path, { analysisId: analysis.id })).json()) as { plan: SavedPlanBody })
      .plan
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
