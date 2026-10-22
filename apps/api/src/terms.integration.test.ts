// The beta terms at API level (#42): sign-up needs the current terms version, which the account stores with the time;
// a user on an older version can accept the current one; and nobody changes it through the profile update.
import { TERMS_VERSION } from '@fodr/contracts/terms'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { authApp, BASE_URL, signedInUser } from '../test/auth-app'
import { users } from './db/schema'

const { app, database, close } = authApp()
afterAll(close)

let ipCounter = 0
const nextIp = () => `10.42.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`

const signUp = (body: object) =>
  app.request(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL, 'x-forwarded-for': nextIp() },
    body: JSON.stringify({ name: 'Eva', password: 'hemligt-losenord-1', ...body }),
  })
const rowOf = async (email: string) => (await database.db.select().from(users).where(eq(users.email, email))).at(0)

describe('the beta terms', () => {
  it('must be accepted, in their current version, to sign up', async () => {
    for (const termsVersion of [undefined, '', '2020-01-01']) {
      const email = `no-terms-${String(Date.now())}-${String(Math.random()).slice(2, 8)}@example.se`
      const res = await signUp({ email, termsVersion })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'TERMS_NOT_ACCEPTED' })
      expect(await rowOf(email)).toBeUndefined()
    }
  })

  it('are stored with the account, with the time, and shown in /me', async () => {
    const { browser, email } = await signedInUser(app, nextIp())
    const row = await rowOf(email)
    expect(row?.termsVersion).toBe(TERMS_VERSION)
    expect(row?.termsAcceptedAt).toBeInstanceOf(Date)
    expect(await (await browser.request('/api/v1/me')).json()).toMatchObject({ user: { termsVersion: TERMS_VERSION } })
  })

  it('can be accepted again in the current version by a user on an older one', async () => {
    const { browser, email } = await signedInUser(app, nextIp())
    await database.db.update(users).set({ termsVersion: '2020-01-01' }).where(eq(users.email, email))
    expect(await (await browser.request('/api/v1/me')).json()).toMatchObject({ user: { termsVersion: '2020-01-01' } })
    expect((await browser.post('/api/v1/me/terms', { version: '2020-01-01' })).status).toBe(400)
    const res = await browser.post('/api/v1/me/terms', { version: TERMS_VERSION })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ user: { termsVersion: TERMS_VERSION } })
    expect((await rowOf(email))?.termsVersion).toBe(TERMS_VERSION)
  })

  it('are never changed through the profile update', async () => {
    const { browser, email } = await signedInUser(app, nextIp())
    const res = await browser.post('/api/auth/update-user', { termsVersion: '2099-01-01' })
    expect(res.status).toBe(400)
    expect((await rowOf(email))?.termsVersion).toBe(TERMS_VERSION)
  })

  it('cannot be accepted without a session', async () => {
    const res = await app.request(`${BASE_URL}/api/v1/me/terms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify({ version: TERMS_VERSION }),
    })
    expect(res.status).toBe(401)
  })
})
