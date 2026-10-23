// Product administration at API level (#36, CF9): an admin role no client can set, granted by the CLI's repository
// call; admin routes that answer 404 to everyone else; and every write a new version and a new product set, so the
// catalogue changes at once while an older set (a saved plan's) keeps its versions. The import leaves what an admin
import { TERMS_VERSION } from '@fodr/contracts/terms'
// wrote. On a database of its own, since these tests change the catalogue the other test files plan with.
import { ProductDataSchema, type AdminProduct, type ProductData } from '@fodr/contracts/admin'
import type { Produkt } from '@fodr/domain/types'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { authApp, BASE_URL, signedInUser } from '../test/auth-app'
import { recreateDatabase } from '../test/database'
import { COMPLETE } from '../test/fixtures/analyses'
import { SIXTEN } from '../test/fixtures/horses'
import { loadCatalogueFile } from './catalogue-file'
import { users } from './db/schema'
import { accountRepository } from './repositories/accounts'
import { productRepository } from './repositories/products'

const adminUrl = new URL(inject('databaseUrl'))
adminUrl.pathname = '/fodr'
const harness = authApp({
  databaseUrl: await recreateDatabase(adminUrl.href, 'fodr_test_admin', { withCatalogue: true }),
})
const { app, database, errors } = harness
afterAll(harness.close)
const accounts = accountRepository(database.db)
const products = productRepository(database.db)
const FILE = loadCatalogueFile()

let ipCounter = 0
const nextIp = () => `10.36.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`

async function admin() {
  const signedIn = await signedInUser(app, nextIp())
  expect(await accounts.setRole(signedIn.email, 'admin')).toBe('ok')
  return signedIn
}

// A product's data as the admin view has it: everything but its ID.
const dataOf = (product: Produkt): ProductData => ProductDataSchema.parse(product)
const NEW: ProductData = {
  ...dataOf(FILE[0]),
  namn: 'Testfoder Admin',
  marke: 'Testmärke',
  iUrval: false,
}

describe('the admin role', () => {
  it('is user for a new account, shown in /me, and admin once granted', async () => {
    const { browser, email } = await signedInUser(app, nextIp())
    expect(await (await browser.request('/api/v1/me')).json()).toMatchObject({ user: { email, role: 'user' } })
    expect(await accounts.setRole(email, 'admin')).toBe('ok')
    expect(await (await browser.request('/api/v1/me')).json()).toMatchObject({ user: { role: 'admin' } })
    expect(await accounts.setRole(email, 'user')).toBe('ok')
    expect(await (await browser.request('/api/v1/me')).json()).toMatchObject({ user: { role: 'user' } })
  })

  it('cannot be set at sign-up', async () => {
    const email = `self-made-admin-${String(Date.now())}@example.se`
    await app.request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL, 'x-forwarded-for': nextIp() },
      body: JSON.stringify({
        name: 'Eva',
        email,
        password: 'hemligt-losenord-1',
        termsVersion: TERMS_VERSION,
        role: 'admin',
      }),
    })
    const [row] = await database.db.select({ role: users.role }).from(users).where(eq(users.email, email))
    expect(row.role).toBe('user')
  })

  it('is granted only to an existing, verified account', async () => {
    expect(await accounts.setRole('ingen@example.se', 'admin')).toBe('not_found')
    const email = `unverified-${String(Date.now())}@example.se`
    await app.request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL, 'x-forwarded-for': nextIp() },
      body: JSON.stringify({ name: 'Eva', email, password: 'hemligt-losenord-1', termsVersion: TERMS_VERSION }),
    })
    expect(await accounts.setRole(email, 'admin')).toBe('unverified')
  })
})

describe('the admin routes', () => {
  it('answer 404 to a signed-out caller and to a signed-in user who is no admin', async () => {
    const { browser } = await signedInUser(app, nextIp())
    const paths = ['/api/v1/admin/products', `/api/v1/admin/products/${FILE[0].id}`]
    for (const path of paths) {
      expect((await app.request(`${BASE_URL}${path}`)).status).toBe(404)
      expect((await browser.request(path)).status).toBe(404)
    }
    expect((await browser.post('/api/v1/admin/products', { data: NEW, verifiedOn: null })).status).toBe(404)
    expect((await browser.request(`/api/v1/admin/products/${FILE[0].id}`, { method: 'PUT', body: {} })).status).toBe(
      404,
    )
    expect((await browser.post(`/api/v1/admin/products/${FILE[0].id}/retire`, {})).status).toBe(404)
  })

  it('list every product with its newest version', async () => {
    const { browser } = await admin()
    const res = await browser.request('/api/v1/admin/products')
    expect(res.status).toBe(200)
    const { products: listed } = (await res.json()) as { products: AdminProduct[] }
    expect(listed.length).toBeGreaterThanOrEqual(FILE.length)
    expect(listed.find((p) => p.id === FILE[0].id)).toMatchObject({
      data: dataOf(FILE[0]),
      retired: false,
      editedByAdmin: false,
      verifiedOn: null,
    })
  })

  it('create a product, which joins the catalogue at once', async () => {
    const { browser } = await admin()
    const before = await products.currentSetId()
    const res = await browser.post('/api/v1/admin/products', { data: NEW, verifiedOn: '2026-10-22' })
    expect(res.status).toBe(201)
    const { product } = (await res.json()) as { product: AdminProduct }
    expect(product).toMatchObject({ data: NEW, verifiedOn: '2026-10-22', retired: false, editedByAdmin: true })
    expect(product.id).toMatch(/^adm-/)
    const after = await products.currentSetId()
    expect(after).not.toBe(before)
    expect((await products.products(after ?? '')).map((p) => p.id)).toContain(product.id)
    const served = (await (await browser.request('/api/v1/products')).json()) as { products: Produkt[] }
    expect(served.products.find((p) => p.id === product.id)).toMatchObject({ namn: 'Testfoder Admin' })
  })

  it('save a new version, leaving the older set as it was', async () => {
    const { browser } = await admin()
    const target = FILE[1]
    const before = await products.currentSetId()
    const res = await browser.request(`/api/v1/admin/products/${target.id}`, {
      method: 'PUT',
      body: { data: { ...dataOf(target), prisKr: target.prisKr + 50 }, verifiedOn: '2026-10-22' },
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { product: AdminProduct }).product).toMatchObject({
      editedByAdmin: true,
      verifiedOn: '2026-10-22',
      data: { prisKr: target.prisKr + 50 },
    })
    const after = await products.currentSetId()
    expect((await products.products(after ?? '')).find((p) => p.id === target.id)?.prisKr).toBe(target.prisKr + 50)
    // The set a plan saved before still holds the version it was computed from.
    expect((await products.products(before ?? '')).find((p) => p.id === target.id)?.prisKr).toBe(target.prisKr)
  })

  it('retire and restore a product, each a new set', async () => {
    const { browser } = await admin()
    const target = FILE[2]
    const retired = await browser.post(`/api/v1/admin/products/${target.id}/retire`, {})
    expect(((await retired.json()) as { product: AdminProduct }).product).toMatchObject({ retired: true })
    expect((await products.products((await products.currentSetId()) ?? '')).map((p) => p.id)).not.toContain(target.id)
    const restored = await browser.post(`/api/v1/admin/products/${target.id}/restore`, {})
    expect(((await restored.json()) as { product: AdminProduct }).product).toMatchObject({ retired: false })
    expect((await products.products((await products.currentSetId()) ?? '')).map((p) => p.id)).toContain(target.id)
  })

  it('keep a retired product out of the catalogue when it is edited, until it is restored', async () => {
    const { browser } = await admin()
    const target = FILE[6]
    await browser.post(`/api/v1/admin/products/${target.id}/retire`, {})
    await browser.request(`/api/v1/admin/products/${target.id}`, {
      method: 'PUT',
      body: { data: { ...dataOf(target), prisKr: 7 }, verifiedOn: null },
    })
    const ids = async () => (await products.products((await products.currentSetId()) ?? '')).map((p) => p.id)
    expect(await ids()).not.toContain(target.id)
    await browser.post(`/api/v1/admin/products/${target.id}/restore`, {})
    const current = await products.products((await products.currentSetId()) ?? '')
    expect(current.find((p) => p.id === target.id)?.prisKr).toBe(7)
  })

  it('make no new set for a retirement that changes nothing', async () => {
    const { browser } = await admin()
    const target = FILE[7]
    await browser.post(`/api/v1/admin/products/${target.id}/retire`, {})
    const before = await products.currentSetId()
    await browser.post(`/api/v1/admin/products/${target.id}/retire`, {})
    expect(await products.currentSetId()).toBe(before)
  })

  it('take retire and restore only as JSON, as every write (CSRF, ADR 0013)', async () => {
    // A form post, as another site's page could send with the cookie: refused before anything changes.
    const signedIn = await admin()
    const form = new FormData()
    form.set('x', '1')
    const res = await signedIn.browser.upload(`/api/v1/admin/products/${FILE[8].id}/retire`, form)
    expect(res.status).toBe(415)
    expect((await products.get(FILE[8].id))?.retired).toBe(false)
  })

  it('refuse a link that is not http or https', async () => {
    const { browser } = await admin()
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.se']) {
      expect((await browser.post('/api/v1/admin/products', { data: { ...NEW, url }, verifiedOn: null })).status).toBe(
        400,
      )
    }
  })

  it('refuse data the contract does not allow, and an unknown product', async () => {
    const { browser } = await admin()
    const bad = await browser.post('/api/v1/admin/products', { data: { ...NEW, prisKr: -1 }, verifiedOn: null })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ code: 'validation.invalid' })
    const dose = await browser.post('/api/v1/admin/products', {
      data: { ...NEW, dosGramPer100kg: { min: 30, max: 10 } },
      verifiedOn: null,
    })
    expect(dose.status).toBe(400)
    expect((await browser.request('/api/v1/admin/products/finns-inte')).status).toBe(404)
    const put = await browser.request('/api/v1/admin/products/finns-inte', {
      method: 'PUT',
      body: { data: NEW, verifiedOn: null },
    })
    expect(put.status).toBe(404)
  })
})

describe('the import after an admin wrote a product', () => {
  it('leaves what the admin wrote, and still updates the others', async () => {
    const { browser } = await admin()
    const edited = FILE[3]
    await browser.request(`/api/v1/admin/products/${edited.id}`, {
      method: 'PUT',
      body: { data: { ...dataOf(edited), prisKr: 1 }, verifiedOn: null },
    })
    const other = FILE[4]
    const file = FILE.map((p) =>
      p.id === edited.id ? { ...p, prisKr: 999 } : p.id === other.id ? { ...p, prisKr: other.prisKr + 1 } : p,
    )
    const result = await products.importCatalogue(file)
    expect(result.kept).toBeGreaterThan(0)
    const current = await products.products((await products.currentSetId()) ?? '')
    expect(current.find((p) => p.id === edited.id)?.prisKr).toBe(1)
    expect(current.find((p) => p.id === other.id)?.prisKr).toBe(other.prisKr + 1)
  })

  it('neither retires what an admin made nor brings back what an admin retired', async () => {
    const { browser } = await admin()
    const created = (
      (await (await browser.post('/api/v1/admin/products', { data: NEW, verifiedOn: null })).json()) as {
        product: AdminProduct
      }
    ).product
    const retiredByAdmin = FILE[5]
    await browser.post(`/api/v1/admin/products/${retiredByAdmin.id}/retire`, {})
    await products.importCatalogue(FILE)
    const ids = (await products.products((await products.currentSetId()) ?? '')).map((p) => p.id)
    expect(ids).toContain(created.id)
    expect(ids).not.toContain(retiredByAdmin.id)
  })
})

// CF5 across product changes (#38): an admin's edit of a product a saved plan uses never changes that plan, and a plan
// saved after it uses the new version. On a product of the test's own, which no other plan uses.
describe('a saved plan when a product it uses is edited', () => {
  it('keeps what it was computed from, and a new plan uses the new version', async () => {
    const { browser } = await admin()
    const feed: ProductData = {
      ...NEW,
      namn: 'Eget foder CF5',
      kategori: 'ovrigt',
      naringsdata: 'saknas',
      perKg: {},
      prisKr: 200,
      forpackningKg: 10,
    }
    const { product } = (await (
      await browser.post('/api/v1/admin/products', { data: feed, verifiedOn: null })
    ).json()) as {
      product: AdminProduct
    }
    const horse = (await (
      await browser.post('/api/v1/horses', {
        ...SIXTEN,
        nuvarandeFoder: [{ produktId: product.id, namn: feed.namn, gramPerDag: 500 }],
      })
    ).json()) as { id: string }
    const analysis = (await (
      await browser.post(`/api/v1/horses/${horse.id}/analyses`, { analys: COMPLETE })
    ).json()) as {
      id: string
    }
    const plans = `/api/v1/horses/${horse.id}/plans`
    type SavedPlan = { id: string; productSetVersion: string; result: { behallnaFoder: { produkt: Produkt }[] } }
    type Entry = { plan?: { planId: string; kostnadPerManad: number; produkter: { namn: string }[] } }
    const kept = (plan: SavedPlan) => plan.result.behallnaFoder.find((f) => f.produkt.id === product.id)?.produkt.prisKr
    const saved = (await (
      await browser.post(plans, { analysisId: analysis.id, journalDatum: '2026-10-22' })
    ).json()) as {
      plan: SavedPlan
      entry: Entry
    }
    expect(kept(saved.plan)).toBe(200)
    // The journal's snapshot covers the product, with a cost to compare.
    const cost = saved.entry.plan?.kostnadPerManad
    expect(cost).toEqual(expect.any(Number))
    expect(saved.entry.plan?.produkter.map((p) => p.namn)).toContain(feed.namn)

    const edited = await browser.request(`/api/v1/admin/products/${product.id}`, {
      method: 'PUT',
      body: { data: { ...feed, prisKr: 400 }, verifiedOn: null },
    })
    expect(edited.status).toBe(200)

    // The saved plan and its journal entry: as they were.
    const latest = ((await (await browser.request(`${plans}/latest`)).json()) as { plan: SavedPlan }).plan
    expect(latest).toEqual(saved.plan)
    const { entries } = (await (await browser.request(`/api/v1/horses/${horse.id}/journal`)).json()) as {
      entries: Entry[]
    }
    expect(entries.find((e) => e.plan?.planId === saved.plan.id)?.plan?.kostnadPerManad).toBe(cost)

    // A plan saved now: the new version, in a new product set.
    const again = await browser.post(plans, { analysisId: analysis.id })
    expect(again.status).toBe(201)
    const next = ((await again.json()) as { plan: SavedPlan }).plan
    expect(next.id).not.toBe(saved.plan.id)
    expect(next.productSetVersion).not.toBe(saved.plan.productSetVersion)
    expect(kept(next)).toBe(400)
  })
})

// The admin's check that error tracking reaches Sentry (#43): a test error on the server, reported like any other.
describe('the test error', () => {
  const path = '/api/v1/admin/test-error'

  it('answers 404 to a signed-out caller and to a signed-in user who is no admin, and reports nothing', async () => {
    errors.reports.length = 0
    const { browser } = await signedInUser(app, nextIp())
    expect((await app.request(`${BASE_URL}${path}`, { method: 'POST' })).status).toBe(404)
    expect((await browser.post(path, {})).status).toBe(404)
    expect(errors.reports).toEqual([])
  })

  it('fails with 500 for an admin and is reported with its request ID and the admin', async () => {
    errors.reports.length = 0
    const signedIn = await admin()
    const res = await signedIn.browser.post(path, {})
    expect(res.status).toBe(500)
    const me = (await (await signedIn.browser.request('/api/v1/me')).json()) as { user: { id: string } }
    expect(errors.reports).toHaveLength(1)
    expect(errors.reports[0]?.context).toEqual({
      requestId: res.headers.get('X-Request-Id'),
      userId: me.user.id,
      route: path,
    })
    expect(String(errors.reports[0]?.error)).toMatch(/test error/i)
  })

  it('takes only JSON, as every write (CSRF, ADR 0013)', async () => {
    errors.reports.length = 0
    const signedIn = await admin()
    const form = new FormData()
    form.set('x', '1')
    expect((await signedIn.browser.upload(path, form)).status).toBe(415)
    expect(errors.reports).toEqual([])
  })
})
