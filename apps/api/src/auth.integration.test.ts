// CF1 at API level (#22): every account flow against the real Postgres and Mailpit, through the HTTP API.
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { authApp, BASE_URL, client } from '../test/auth-app'
import { clearMail, linkIn, mailCount, waitForMail } from '../test/mailpit'

const { app, database, logs, close } = authApp()
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
    expect(session).not.toMatch(/;\s*Secure(;|$)/i)
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
      expect(session).toMatch(/;\s*Secure(;|$)/i)
      expect(session).toMatch(/;\s*HttpOnly(;|$)/i)
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

  it('answers an unknown email like a known one, sends nothing and creates no account', async () => {
    const email = newEmail()
    const browser = newClient()
    const res = await browser.post('/api/auth/sign-in/magic-link', { email, callbackURL: '/horses' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: true })
    // Mail is sent without blocking the reply, so give a link the time to arrive before asserting there is none.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(await mailCount(email)).toBe(0)
    const users = await database.db.execute(sql`select count(*)::int as n from users where email = ${email}`)
    expect(users.rows[0]).toEqual({ n: 0 })
  })

  it('refuses a callback URL on another site', async () => {
    const { email } = await verifiedUser()
    const res = await newClient().post('/api/auth/sign-in/magic-link', { email, callbackURL: 'https://evil.example/x' })
    expect(res.status).toBe(403)
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

describe('a sign up for an email that already has an account (#22 review)', () => {
  it('mails the owner of a verified account instead of changing anything, and replies as to a new sign up', async () => {
    const { email } = await verifiedUser()
    await clearMail()
    const fresh = await newClient().post('/api/auth/sign-up/email', {
      name: 'Ny',
      email: newEmail(),
      password: PASSWORD,
      callbackURL: '/horses',
    })
    const duplicate = await newClient().post('/api/auth/sign-up/email', {
      name: 'Inkräktare',
      email,
      password: 'inkraktarens-losenord',
      callbackURL: '/horses',
    })
    expect(duplicate.status).toBe(fresh.status)
    expect(Object.keys((await duplicate.json()) as object).sort()).toEqual(
      Object.keys((await fresh.json()) as object).sort(),
    )
    expect((await waitForMail(email)).subject).toMatch(/redan ett konto/)
    expect((await newClient().post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(200)
    expect(
      (await newClient().post('/api/auth/sign-in/email', { email, password: 'inkraktarens-losenord' })).status,
    ).toBe(401)
  })

  it('lets the mailbox owner take over an account someone else created with their email, locking the other out', async () => {
    const email = newEmail()
    const attacker = newClient()
    await attacker.post('/api/auth/sign-up/email', {
      name: 'X',
      email,
      password: 'angriparens-losenord',
      callbackURL: '/horses',
    })
    // The verification mail for the attacker's sign up goes to the owner's mailbox; let it land before clearing.
    await waitForMail(email)
    await clearMail()

    const owner = newClient()
    await owner.post('/api/auth/sign-up/email', { name: 'Anna', email, password: PASSWORD, callbackURL: '/horses' })
    const mail = await waitForMail(email)
    expect(mail.subject).toMatch(/lösenord/)
    const token = linkIn(mail).pathname.split('/').at(-1)
    expect((await owner.post('/api/auth/reset-password', { token, newPassword: 'agarens-losenord-1' })).status).toBe(
      200,
    )

    expect(
      (await newClient().post('/api/auth/sign-in/email', { email, password: 'angriparens-losenord' })).status,
    ).toBe(401)
    const login = newClient()
    expect((await login.post('/api/auth/sign-in/email', { email, password: 'agarens-losenord-1' })).status).toBe(200)
    expect(await (await login.request('/api/v1/me')).json()).toMatchObject({ user: { email, emailVerified: true } })
  })
})

describe('cross-site requests (#22 review)', () => {
  it('refuses a request with the session cookie from another origin', async () => {
    const { browser } = await verifiedUser()
    const res = await app.request(`${BASE_URL}/api/auth/sign-out`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
        'x-forwarded-for': '10.200.0.1',
        cookie: [...browser.cookies].map(([n, v]) => `${n}=${v}`).join('; '),
      },
      body: '{}',
    })
    expect(res.status).toBe(403)
    expect((await browser.request('/api/v1/me')).status).toBe(200)
  })

  it('refuses a password reset that would redirect to another site', async () => {
    const { email } = await verifiedUser()
    const res = await newClient().post('/api/auth/request-password-reset', {
      email,
      redirectTo: 'https://evil.example/r',
    })
    expect(res.status).toBe(403)
  })
})

describe('the account name (#22 review)', () => {
  it('refuses a name over 100 characters', async () => {
    const res = await newClient().post('/api/auth/sign-up/email', {
      name: 'x'.repeat(101),
      email: newEmail(),
      password: PASSWORD,
      callbackURL: '/horses',
    })
    expect(res.status).toBe(400)
  })

  it('never puts the name in a mail, so it cannot carry a message from Fodr', async () => {
    const email = newEmail()
    await newClient().post('/api/auth/sign-up/email', {
      name: 'Fodr support logga in via https://evil.example/fodr',
      email,
      password: PASSWORD,
      callbackURL: '/horses',
    })
    expect((await waitForMail(email)).text).not.toMatch(/evil\.example|Fodr support/)
  })
})

describe('the session (#22 review)', () => {
  it('renews an aging session through /api/v1/me, so an active user stays signed in', async () => {
    const { email, browser } = await verifiedUser()
    // A session one day from expiry is past Better Auth's update age (a day into the seven) and gets renewed.
    await database.db.execute(
      sql`update sessions set expires_at = now() + interval '1 day' where user_id = (select id from users where email = ${email})`,
    )
    const res = await browser.request('/api/v1/me')
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().some((c) => c.includes('session_token'))).toBe(true)
  })
})

describe('logs (#22 review)', () => {
  it('never contain an email address or query parameters when Better Auth fails a query', async () => {
    // Better Auth logs to the console by default, bypassing pino and its error serializer (ADR 0015).
    const consoleOutput: unknown[] = []
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void consoleOutput.push(...args)),
    )
    try {
      const email = newEmail()
      const res = await newClient().post('/api/auth/sign-up/email', {
        name: 'a\u0000b',
        email,
        password: PASSWORD,
        callbackURL: '/horses',
      })
      expect(res.status).toBeGreaterThanOrEqual(400)
      const everything = logs.join('') + consoleOutput.map((x) => String(x)).join('\n')
      expect(everything).not.toContain(email)
      expect(everything).not.toMatch(/params:/)
      expect(consoleOutput).toEqual([])
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})
