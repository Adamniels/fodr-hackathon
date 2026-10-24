// CF7 at API level (#28): the journal per horse, through the horse's membership (ADR 0010). An entry can update the
// profile in the same transaction; saving a plan with a journal date makes its entry, whose snapshot comes from the
// stored plan.
import { ogonblickAvPlan } from '@fodr/domain/journal'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { authApp, signedInUser } from '../test/auth-app'
import { COMPLETE } from '../test/fixtures/analyses'
import { SIXTEN } from '../test/fixtures/horses'
import { journalEntries } from './db/schema'

const { app, database, close } = authApp()
afterAll(close)

let ipCounter = 0
const nextIp = () => `10.28.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`

interface Entry {
  id: string
  datum: string
  viktKg?: number
  hull?: number
  text: string
  plan?: Record<string, unknown>
  skapad: string
}

async function horse() {
  const { browser } = await signedInUser(app, nextIp())
  const { id } = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
  return { browser, horseId: id, journal: `/api/v1/horses/${id}/journal` }
}

const list = async (browser: Awaited<ReturnType<typeof horse>>['browser'], path: string) =>
  ((await (await browser.request(path)).json()) as { entries: Entry[] }).entries

describe('journal entries', () => {
  it('are added and listed by date, and by when they were made on the same date', async () => {
    const { browser, journal } = await horse()
    expect(await list(browser, journal)).toEqual([])
    // Five on one date: random IDs would put them in this order only one time in 120.
    const sameDay = ['ett', 'två', 'tre', 'fyra', 'fem']
    for (const [datum, text] of [
      ['2026-10-15', sameDay[0]],
      ['2026-10-14', 'dagen före'],
      ...sameDay.slice(1).map((t) => ['2026-10-15', t]),
    ]) {
      const res = await browser.post(journal, { datum, text })
      expect(res.status).toBe(201)
    }
    const entries = await list(browser, journal)
    expect(entries.map((e) => e.text)).toEqual(['dagen före', ...sameDay])
    expect(entries[0]).toMatchObject({ datum: '2026-10-14', skapad: expect.any(String) as string })
  })

  it('keeps weight and condition, and leaves a missing one missing', async () => {
    const { browser, journal } = await horse()
    const res = await browser.post(journal, { datum: '2026-10-15', viktKg: 545, text: '' })
    const { entry, horse: updated } = (await res.json()) as { entry: Entry; horse: unknown }
    expect(entry).toMatchObject({ viktKg: 545, text: '' })
    expect(entry).not.toHaveProperty('hull')
    expect(updated).toBeNull()
  })

  it('updates the profile in the same transaction when asked', async () => {
    const { browser, horseId, journal } = await horse()
    const res = await browser.post(journal, {
      datum: '2026-10-15',
      viktKg: 540,
      hull: 6,
      text: '',
      updateProfile: true,
    })
    expect(res.status).toBe(201)
    const { horse: updated } = (await res.json()) as { horse: { viktKg: number; hull: number } }
    // A write like a save (#140): a device whose copy is from before it can no longer save over it.
    expect(updated).toMatchObject({ viktKg: 540, hull: 6, version: 2 })
    expect(await (await browser.request(`/api/v1/horses/${horseId}`)).json()).toMatchObject({
      viktKg: 540,
      hull: 6,
      version: 2,
    })
    const stale = await browser.request(`/api/v1/horses/${horseId}`, {
      method: 'PUT',
      body: SIXTEN,
      headers: { 'if-match': '"1"' },
    })
    expect(stale.status).toBe(412)
  })

  it('leaves the version as it was when the entry changes nothing of the profile (#140)', async () => {
    const { browser, horseId, journal } = await horse()
    await browser.post(journal, { datum: '2026-10-15', text: 'Bara en rad', updateProfile: true })
    await browser.post(journal, { datum: '2026-10-15', viktKg: 540, text: '', updateProfile: false })
    expect(await (await browser.request(`/api/v1/horses/${horseId}`)).json()).toMatchObject({ version: 1 })
  })

  it('refuses values the domain refuses, and writes nothing, the profile neither', async () => {
    const { browser, horseId, journal } = await horse()
    const res = await browser.post(journal, { datum: '2026-13-40', viktKg: 5, text: '', updateProfile: true })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      code: 'validation.invalid',
      errors: [
        { path: 'datum', code: 'validation.date' },
        { path: 'viktKg', code: 'validation.range' },
      ],
    })
    expect(await list(browser, journal)).toEqual([])
    expect(await (await browser.request(`/api/v1/horses/${horseId}`)).json()).toMatchObject({ viktKg: SIXTEN.viktKg })
  })

  it('updates only the measured value: a condition alone leaves the weight as it was', async () => {
    const { browser, horseId, journal } = await horse()
    await browser.post(journal, { datum: '2026-10-15', hull: 6, text: '', updateProfile: true })
    expect(await (await browser.request(`/api/v1/horses/${horseId}`)).json()).toMatchObject({
      viktKg: SIXTEN.viktKg,
      hull: 6,
    })
  })

  it('never takes a plan from the client: only saving a plan links one', async () => {
    const { browser, journal } = await horse()
    const res = await browser.post(journal, {
      datum: '2026-10-15',
      text: 'x',
      planId: '00000000-0000-4000-8000-000000000000',
      plan: { analys: 'falsk', grovfoderKgPerDag: 1, produkter: [], kostnadPerManad: 0 },
    })
    expect(res.status).toBe(201)
    expect(((await res.json()) as { entry: Entry }).entry).not.toHaveProperty('plan')
  })

  it('needs a session, and refuses a body larger than an entry can be', async () => {
    const { browser, journal } = await horse()
    expect((await app.request(`http://localhost:3000${journal}`)).status).toBe(401)
    expect((await browser.post(journal, { datum: '2026-10-15', text: 'x'.repeat(20 * 1024) })).status).toBe(413)
  })

  it('refuses a text longer than an entry may be', async () => {
    const { browser, journal } = await horse()
    expect((await browser.post(journal, { datum: '2026-10-15', text: 'x'.repeat(2001) })).status).toBe(400)
  })

  it("is 404 for another user's horse", async () => {
    const { journal } = await horse()
    const { browser: other } = await signedInUser(app, nextIp())
    expect((await other.request(journal)).status).toBe(404)
    expect(
      (await other.post(journal, { datum: '2026-10-15', text: 'x', updateProfile: true, viktKg: 500 })).status,
    ).toBe(404)
  })

  it('go with their horse', async () => {
    const { browser, horseId, journal } = await horse()
    await browser.post(journal, { datum: '2026-10-15', text: 'x' })
    await browser.request(`/api/v1/horses/${horseId}`, { method: 'DELETE' })
    expect(await database.db.select().from(journalEntries).where(eq(journalEntries.horseId, horseId))).toEqual([])
  })
})

describe('saving a plan to the journal', () => {
  it('makes the plan and its entry together, the snapshot coming from the stored plan', async () => {
    const { browser, horseId, journal } = await horse()
    const analysis = (await (
      await browser.post(`/api/v1/horses/${horseId}/analyses`, { analys: COMPLETE })
    ).json()) as { id: string }
    const res = await browser.post(`/api/v1/horses/${horseId}/plans`, {
      analysisId: analysis.id,
      journalDatum: '2026-10-15',
    })
    expect(res.status).toBe(201)
    const { plan, entry } = (await res.json()) as {
      plan: { id: string; result: Parameters<typeof ogonblickAvPlan>[0]; inputs: { analys: typeof COMPLETE } }
      entry: Entry
    }
    const snapshot = JSON.parse(JSON.stringify(ogonblickAvPlan(plan.result, plan.inputs.analys, plan.id))) as unknown
    expect(entry).toMatchObject({ datum: '2026-10-15', text: '', plan: snapshot })
    expect(await list(browser, journal)).toEqual([entry])
  })

  it('refuses a journal date that is no date, and saves no plan', async () => {
    const { browser, horseId } = await horse()
    const analysis = (await (
      await browser.post(`/api/v1/horses/${horseId}/analyses`, { analys: COMPLETE })
    ).json()) as { id: string }
    const res = await browser.post(`/api/v1/horses/${horseId}/plans`, { analysisId: analysis.id, journalDatum: 'igår' })
    expect(res.status).toBe(400)
    expect(await (await browser.request(`/api/v1/horses/${horseId}/plans/latest`)).json()).toEqual({ plan: null })
  })
})
