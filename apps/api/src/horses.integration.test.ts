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
// A save of the copy read at `version` (#140): every horse a test creates starts at 1.
const put = (browser: Browser, path: string, body: unknown, version = 1) =>
  browser.request(path, { method: 'PUT', body, headers: { 'if-match': `"${String(version)}"` } })
const remove = (browser: Browser, path: string) => browser.request(path, { method: 'DELETE' })

async function createHorse(browser: Browser, profile: unknown = SIXTEN) {
  const res = await browser.post('/api/v1/horses', profile)
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string; version: number } & Record<string, unknown>
}

describe('horses of one user', () => {
  it('creates a horse with a server ID and returns it as sent', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser)
    expect(horse.id).toMatch(UUID)
    expect(horse).toEqual({ id: horse.id, version: 1, ...SIXTEN })
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
    expect(await replaced.json()).toEqual({ id: sixten.id, version: 2, ...changed })
    expect(await (await browser.request(`/api/v1/horses/${sixten.id}`)).json()).toEqual({
      id: sixten.id,
      version: 2,
      ...changed,
    })

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
    expect(res.status).toBe(200)
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

    // The same answer as for an ID that names no horse: status, type and body (apart from the request ID).
    const withoutRequestId = async (res: Response) => {
      const body = Object.entries((await res.json()) as Record<string, unknown>).filter(([key]) => key !== 'requestId')
      return { status: res.status, type: res.headers.get('Content-Type'), body: Object.fromEntries(body) }
    }
    const unknown = '00000000-0000-4000-8000-000000000000'
    const expected = await withoutRequestId(await b.browser.request(`/api/v1/horses/${unknown}`))
    expect(expected).toMatchObject({ status: 404, body: { code: 'horse.not_found' } })
    expect(await withoutRequestId(await b.browser.request(`/api/v1/horses/${horse.id}`))).toEqual(expected)
    expect(
      await withoutRequestId(await put(b.browser, `/api/v1/horses/${horse.id}`, { ...SIXTEN, namn: 'Stulen' })),
    ).toEqual(expected)
    expect(await withoutRequestId(await remove(b.browser, `/api/v1/horses/${horse.id}`))).toEqual(expected)
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

describe('request bodies (#24 review)', () => {
  const raw = async (browser: Browser, body: string, contentType = 'application/json') =>
    app.request('http://localhost:3000/api/v1/horses', {
      method: 'POST',
      headers: {
        'content-type': contentType,
        cookie: [...browser.cookies].map(([n, v]) => `${n}=${v}`).join('; '),
      },
      body,
    })

  it('refuses a body over 64 KB with a 413 before parsing it', async () => {
    const { browser } = await user()
    const res = await raw(browser, JSON.stringify({ ...SIXTEN, junk: 'x'.repeat(70 * 1024) }))
    expect(res.status).toBe(413)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await res.json()).toMatchObject({ code: 'request.too_large' })
  })

  it('refuses JSON sent as another content type with a 415', async () => {
    const { browser } = await user()
    for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
      const res = await raw(browser, JSON.stringify(SIXTEN), type)
      expect(res.status, type).toBe(415)
      expect(await res.json()).toMatchObject({ code: 'request.unsupported_media_type' })
    }
    expect((await raw(browser, JSON.stringify(SIXTEN), 'application/json; charset=utf-8')).status).toBe(201)
  })

  it.each(['null', '[]', '"Sixten"'])(
    'answers the non-object body %s with a 400 whose path is the body itself',
    async (body) => {
      const { browser } = await user()
      const res = await raw(browser, body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'validation.invalid', errors: [{ path: '' }] })
    },
  )
})

describe('a save based on an older copy (#140)', () => {
  const path = (id: string) => `/api/v1/horses/${id}`

  it('raises the version with every save, and says it as the ETag', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser)
    expect(horse.version).toBe(1)
    const saved = await put(browser, path(horse.id), { ...SIXTEN, viktKg: 545 }, 1)
    expect(saved.status).toBe(200)
    expect(saved.headers.get('ETag')).toBe('"2"')
    expect(await saved.json()).toMatchObject({ version: 2, viktKg: 545 })
    const read = await browser.request(path(horse.id))
    expect(read.headers.get('ETag')).toBe('"2"')
    expect(await read.json()).toMatchObject({ version: 2 })
  })

  it('refuses a save of an older copy with a 412, and keeps the newer one', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser)
    expect((await put(browser, path(horse.id), { ...SIXTEN, viktKg: 545 }, 1)).status).toBe(200)
    const stale = await put(browser, path(horse.id), { ...SIXTEN, namn: 'Sixten II' }, 1)
    expect(stale.status).toBe(412)
    expect(stale.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await stale.json()).toMatchObject({ code: 'horse.changed' })
    expect(await (await browser.request(path(horse.id))).json()).toMatchObject({
      version: 2,
      namn: 'Sixten',
      viktKg: 545,
    })
  })

  it('lets only one of two saves of the same copy through', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser)
    const statuses = await Promise.all([
      put(browser, path(horse.id), { ...SIXTEN, viktKg: 545 }, 1),
      put(browser, path(horse.id), { ...SIXTEN, namn: 'Sixten II' }, 1),
    ]).then((all) => all.map((r) => r.status).sort())
    expect(statuses).toEqual([200, 412])
    expect(await (await browser.request(path(horse.id))).json()).toMatchObject({ version: 2 })
  })

  it('refuses a save that names no version with a 428', async () => {
    const { browser } = await user()
    const horse = await createHorse(browser)
    const res = await browser.request(path(horse.id), { method: 'PUT', body: SIXTEN })
    expect(res.status).toBe(428)
    expect(await res.json()).toMatchObject({ code: 'request.precondition_required' })
  })

  it.each(['*', 'W/"1"', '"1", "2"', '"ett"', '1'])('refuses the If-Match %s with a 400', async (ifMatch) => {
    const { browser } = await user()
    const horse = await createHorse(browser)
    const res = await browser.request(path(horse.id), { method: 'PUT', body: SIXTEN, headers: { 'if-match': ifMatch } })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'request.invalid_precondition' })
  })

  it("answers another user's horse with a 404, whatever the version", async () => {
    const a = await user()
    const horse = await createHorse(a.browser)
    const b = await user()
    for (const version of [1, 2]) {
      const res = await put(b.browser, path(horse.id), SIXTEN, version)
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 'horse.not_found' })
    }
  })
})
