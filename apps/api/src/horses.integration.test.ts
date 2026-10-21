// CF2 at API level (#24): horses through the repository layer (ADR 0010) against the real Postgres. A user only ever
// reaches their own horses; another's is 404, never 403, so IDs cannot be probed.
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { authApp, client, signedInUser } from '../test/auth-app'
import { PYSEN, SIXTEN } from '../test/fixtures/horses'

const { app, database, close } = authApp()
afterAll(close)

let ipCounter = 0
const nextIp = () => `10.20.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`
const user = () => signedInUser(app, nextIp())
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Browser = Awaited<ReturnType<typeof user>>['browser']
const put = (browser: Browser, path: string, body: unknown) => browser.request(path, { method: 'PUT', body })
const remove = (browser: Browser, path: string) => browser.request(path, { method: 'DELETE' })

async function createHorse(browser: Browser, profile: unknown = SIXTEN) {
  const res = await browser.post('/api/v1/horses', profile)
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string } & Record<string, unknown>
}

describe('horses of one user', () => {
  it('creates a horse with a server ID and returns it as sent', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser)
    expect(horse.id).toMatch(UUID)
    expect(horse).toEqual({ id: horse.id, ...SIXTEN })
  })

  it('lists, reads, replaces and deletes', async () => {
    const { browser } = await user()
    const sixten = await createHorse(browser, SIXTEN)
    const pysen = await createHorse(browser, PYSEN)

    const list = await browser.request('/api/v1/horses')
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual({ horses: [sixten, pysen] })

    expect(await (await browser.request(`/api/v1/horses/${sixten.id}`)).json()).toEqual(sixten)

    const changed = { ...SIXTEN, viktKg: 545, namn: 'Sixten II' }
    const replaced = await put(browser, `/api/v1/horses/${sixten.id}`, changed)
    expect(replaced.status).toBe(200)
    expect(await replaced.json()).toEqual({ id: sixten.id, ...changed })
    expect(await (await browser.request(`/api/v1/horses/${sixten.id}`)).json()).toEqual({ id: sixten.id, ...changed })

    expect((await remove(browser, `/api/v1/horses/${sixten.id}`)).status).toBe(204)
    expect((await browser.request(`/api/v1/horses/${sixten.id}`)).status).toBe(404)
    expect(await (await browser.request('/api/v1/horses')).json()).toEqual({ horses: [pysen] })
  })

  it('ignores an id in the body: the server names the horse', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser, { ...SIXTEN, id: 'mitt-eget-id' })
    expect(horse.id).toMatch(UUID)
    const sixten = await createHorse(browser)
    const res = await put(browser, `/api/v1/horses/${sixten.id}`, { ...SIXTEN, id: horse.id })
    expect(((await res.json()) as { id: string }).id).toBe(sixten.id)
  })

  it('saves a value out of range, as a draft the engine later refuses to plan with', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser, { ...SIXTEN, viktKg: 0 })
    expect(horse.viktKg).toBe(0)
  })

  it('removes the membership with the horse', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser)
    await remove(browser, `/api/v1/horses/${horse.id}`)
    const rows = await database.db.execute(
      sql`select count(*)::int as n from horse_members where horse_id = ${horse.id}`,
    )
    expect(rows.rows[0]).toEqual({ n: 0 })
    const horses = await database.db.execute(sql`select count(*)::int as n from horses where id = ${horse.id}`)
    expect(horses.rows[0]).toEqual({ n: 0 })
  })

  it.each(['00000000-0000-4000-8000-000000000000', 'inte-ett-uuid'])(
    'answers 404 for the unknown ID %s',
    async (id) => {
      const { browser } = await user()
      for (const res of [
        await browser.request(`/api/v1/horses/${id}`),
        await put(browser, `/api/v1/horses/${id}`, SIXTEN),
        await remove(browser, `/api/v1/horses/${id}`),
      ]) {
        expect(res.status).toBe(404)
        expect(res.headers.get('Content-Type')).toBe('application/problem+json')
        expect(await res.json()).toMatchObject({ code: 'horse.not_found' })
      }
    },
  )
})

describe("another user's horse (ADR 0010)", () => {
  it('cannot be read, changed or deleted, and every attempt is a 404 like an unknown ID', async () => {
    const a = await user()
    const b = await user()
    const horse = await createHorse(a.browser)

    expect((await b.browser.request(`/api/v1/horses/${horse.id}`)).status).toBe(404)
    expect((await put(b.browser, `/api/v1/horses/${horse.id}`, { ...SIXTEN, namn: 'Stulen' })).status).toBe(404)
    expect((await remove(b.browser, `/api/v1/horses/${horse.id}`)).status).toBe(404)
    expect(await (await b.browser.request('/api/v1/horses')).json()).toEqual({ horses: [] })

    expect(await (await a.browser.request(`/api/v1/horses/${horse.id}`)).json()).toEqual(horse)
  })
})

describe('without a session', () => {
  it('answers every horse route with 401', async () => {
    const anonymous = client(app, nextIp())
    for (const res of [
      await anonymous.request('/api/v1/horses'),
      await anonymous.post('/api/v1/horses', SIXTEN),
      await anonymous.request('/api/v1/horses/00000000-0000-4000-8000-000000000000'),
      await put(anonymous, '/api/v1/horses/00000000-0000-4000-8000-000000000000', SIXTEN),
      await remove(anonymous, '/api/v1/horses/00000000-0000-4000-8000-000000000000'),
    ]) {
      expect(res.status).toBe(401)
    }
  })
})

describe('validation (ADR 0013)', () => {
  it.each([
    ['text for a number', { ...SIXTEN, viktKg: '550' }, 'viktKg'],
    ['a missing field', { ...SIXTEN, namn: undefined }, 'namn'],
    ['an unknown value', { ...SIXTEN, kon: 'okand' }, 'kon'],
    ['a nested field', { ...SIXTEN, grovfoder: { typ: 'hosilage', kgPerDag: null } }, 'grovfoder.kgPerDag'],
    [
      'a field in a list',
      { ...SIXTEN, nuvarandeFoder: [{ produktId: null, namn: 'X', gramPerDag: 'mycket' }] },
      'nuvarandeFoder.0.gramPerDag',
    ],
    ['a name over 100 characters', { ...SIXTEN, namn: 'x'.repeat(101) }, 'namn'],
    ['notes over 2000 characters', { ...SIXTEN, halsa: { ...SIXTEN.halsa, ovrigt: 'x'.repeat(2001) } }, 'halsa.ovrigt'],
    [
      'over 50 current feeds',
      { ...SIXTEN, nuvarandeFoder: Array.from({ length: 51 }, () => SIXTEN.nuvarandeFoder[0]) },
      'nuvarandeFoder',
    ],
  ])('answers %s with a 400 naming the field', async (_case, body, path) => {
    const { browser } = await user()
    for (const res of [
      await browser.post('/api/v1/horses', body),
      await put(browser, `/api/v1/horses/${(await createHorse(browser)).id}`, body),
    ]) {
      expect(res.status).toBe(400)
      expect(res.headers.get('Content-Type')).toBe('application/problem+json')
      const problem = (await res.json()) as { code: string; errors: { path: string; code: string }[] }
      expect(problem.code).toBe('validation.invalid')
      expect(problem.errors.map((e) => e.path)).toContain(path)
    }
  })

  it('answers a body that is not JSON with a 400', async () => {
    const { browser } = await user()
    const res = await app.request('http://localhost:3000/api/v1/horses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: [...browser.cookies].map(([n, v]) => `${n}=${v}`).join('; '),
      },
      body: '{inte json',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'validation.invalid_json' })
  })
})
