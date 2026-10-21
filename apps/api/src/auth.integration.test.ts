// CF1 at API level (#22): every account flow against the real Postgres and Mailpit, through the HTTP API.
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { authApp, BASE_URL, client } from '../test/auth-app'
import { clearMail, linkIn, waitForMail } from '../test/mailpit'

const { app, database, close } = authApp()
afterAll(close)
beforeEach(clearMail)

let ipCounter = 0
// Each test its own client IP, so the rate limits of one test never block another.
const newClient = () => client(app, `10.0.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`)
let emailCounter = 0
const newEmail = () => `user${String(++emailCounter)}-${String(Date.now())}@example.se`
const PASSWORD = 'hemligt-losenord-1'

/** Signs up and follows the verification link, ending signed in. */
async function verifiedUser() {
  const email = newEmail()
  const browser = newClient()
  expect((await browser.post('/api/auth/sign-up/email', { name: 'Anna', email, password: PASSWORD })).status).toBe(200)
  const link = linkIn(await waitForMail(email))
  await browser.request(link.pathname + link.search)
  return { email, browser }
}

describe('sign up and email verification', () => {
  it('signs up without a session, sends a verification link, and the link verifies and signs in', async () => {
    const email = newEmail()
    const browser = newClient()
    const signUp = await browser.post('/api/auth/sign-up/email', { name: 'Anna', email, password: PASSWORD })
    expect(signUp.status).toBe(200)
    expect((await browser.request('/api/v1/me')).status).toBe(401)

    const mail = await waitForMail(email)
    expect(mail.subject).toMatch(/Bekräfta/)
    const link = linkIn(mail)
    expect(link.origin).toBe(BASE_URL)

    const verify = await browser.request(link.pathname + link.search)
    expect(verify.status).toBe(302)
    const me = await browser.request('/api/v1/me')
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ user: { email, name: 'Anna', emailVerified: true } })
  })

  it('refuses a password login before the email is verified', async () => {
    const email = newEmail()
    const browser = newClient()
    await browser.post('/api/auth/sign-up/email', { name: 'Anna', email, password: PASSWORD })
    const login = await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD })
    expect(login.status).toBe(403)
    expect((await browser.request('/api/v1/me')).status).toBe(401)
  })
})

describe('password login and logout', () => {
  it('logs in with email and password after verification', async () => {
    const { email } = await verifiedUser()
    const browser = newClient()
    expect((await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(200)
    expect((await browser.request('/api/v1/me')).status).toBe(200)
  })

  it('refuses a wrong password', async () => {
    const { email } = await verifiedUser()
    const browser = newClient()
    expect((await browser.post('/api/auth/sign-in/email', { email, password: 'fel-losenord-123' })).status).toBe(401)
    expect((await browser.request('/api/v1/me')).status).toBe(401)
  })

  it('logs out on this device: the old session cookie no longer works', async () => {
    const { browser } = await verifiedUser()
    const sessionCookie = new Map(browser.cookies)
    expect((await browser.post('/api/auth/sign-out', {})).status).toBe(200)

    const replay = newClient()
    for (const [name, value] of sessionCookie) replay.cookies.set(name, value)
    expect((await replay.request('/api/v1/me')).status).toBe(401)
  })

  it('sets the session cookie httpOnly and SameSite=Lax, and Secure only over https', async () => {
    const email = newEmail()
    const browser = newClient()
    await browser.post('/api/auth/sign-up/email', { name: 'Anna', email, password: PASSWORD })
    const link = linkIn(await waitForMail(email))
    const verify = await browser.request(link.pathname + link.search)
    const session = verify.headers.getSetCookie().find((c) => c.includes('session_token'))
    expect(session).toMatch(/HttpOnly/i)
    expect(session).toMatch(/SameSite=Lax/i)
    expect(session).not.toMatch(/Secure/i)
  })
})

describe('the session cookie over https', () => {
  it('is Secure when the API is served over https', async () => {
    const { email } = await verifiedUser()
    const https = authApp({ betterAuthUrl: 'https://fodr.example' })
    try {
      const browser = client(https.app, '10.9.9.9', 'https://fodr.example')
      const login = await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD })
      expect(login.status).toBe(200)
      const session = login.headers.getSetCookie().find((c) => c.includes('session_token'))
      expect(session).toMatch(/Secure/i)
      expect(session).toMatch(/HttpOnly/i)
    } finally {
      await https.close()
    }
  })
})

describe('magic link', () => {
  it('logs an existing user in from the emailed link', async () => {
    const { email } = await verifiedUser()
    await clearMail()
    const browser = newClient()
    expect((await browser.post('/api/auth/sign-in/magic-link', { email, callbackURL: '/horses' })).status).toBe(200)
    const mail = await waitForMail(email)
    expect(mail.subject).toMatch(/Logga in/)
    const link = linkIn(mail)
    await browser.request(link.pathname + link.search)
    expect((await browser.request('/api/v1/me')).status).toBe(200)
  })

  it('answers an unknown email like a known one, and never creates an account from the link', async () => {
    const email = newEmail()
    const browser = newClient()
    const res = await browser.post('/api/auth/sign-in/magic-link', { email, callbackURL: '/horses' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: true })
    // The link goes out either way (so the reply cannot tell); following it must not create the account.
    const link = linkIn(await waitForMail(email))
    await browser.request(link.pathname + link.search)
    expect((await browser.request('/api/v1/me')).status).toBe(401)
    const users = await database.db.execute(sql`select count(*)::int as n from users where email = ${email}`)
    expect(users.rows[0]).toEqual({ n: 0 })
  })
})

describe('password reset', () => {
  it('resets a forgotten password by email: the new password works, the old one and old sessions do not', async () => {
    const { email, browser: oldDevice } = await verifiedUser()
    await clearMail()
    const browser = newClient()
    const request = await browser.post('/api/auth/request-password-reset', { email, redirectTo: '/reset-password' })
    expect(request.status).toBe(200)
    const mail = await waitForMail(email)
    expect(mail.subject).toMatch(/lösenord/)
    const token = linkIn(mail).pathname.split('/').at(-1)

    const newPassword = 'nytt-losenord-2'
    expect((await browser.post('/api/auth/reset-password', { token, newPassword })).status).toBe(200)
    expect((await newClient().post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(401)
    expect((await newClient().post('/api/auth/sign-in/email', { email, password: newPassword })).status).toBe(200)
    expect((await oldDevice.request('/api/v1/me')).status).toBe(401)
  })
})

describe('protected routes', () => {
  it('answers a request without a session with a problem+json 401', async () => {
    const res = await newClient().request('/api/v1/me')
    expect(res.status).toBe(401)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await res.json()).toMatchObject({ status: 401, code: 'auth.unauthenticated' })
  })
})

describe('rate limits', () => {
  it('answers repeated login attempts from one address with 429', async () => {
    const browser = newClient()
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) {
      statuses.push((await browser.post('/api/auth/sign-in/email', { email: newEmail(), password: PASSWORD })).status)
    }
    expect(statuses).toContain(429)
    // Another address is not affected.
    expect((await newClient().post('/api/auth/sign-in/email', { email: newEmail(), password: PASSWORD })).status).toBe(
      401,
    )
  })

  it('keys on the connection when no proxy header is trusted, so a spoofed header changes nothing', async () => {
    const direct = authApp({ clientIpHeader: undefined })
    const server = serve({ fetch: direct.app.fetch, port: 0, hostname: '127.0.0.1' })
    await new Promise((resolve) => server.once('listening', resolve))
    const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
    try {
      const statuses: number[] = []
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`${url}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: BASE_URL,
            'x-forwarded-for': `203.0.113.${String(i)}`,
            'x-fodr-client-ip': `198.51.100.${String(i)}`,
          },
          body: JSON.stringify({ email: newEmail(), password: PASSWORD }),
        })
        statuses.push(res.status)
      }
      expect(statuses).toContain(429)
    } finally {
      await new Promise((resolve) => server.close(resolve))
      await direct.close()
    }
  })

  it('limits magic link and password reset requests too', async () => {
    for (const path of ['/api/auth/sign-in/magic-link', '/api/auth/request-password-reset']) {
      const browser = newClient()
      const statuses: number[] = []
      for (let i = 0; i < 6; i++) statuses.push((await browser.post(path, { email: newEmail() })).status)
      expect(statuses, path).toContain(429)
    }
  })
})
