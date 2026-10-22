// The demo account's seed (#29): idempotent, a working login, journal dates counted back from "today", and nothing of
// any other account touched.
import { afterAll, describe, expect, it } from 'vitest'
import { TERMS_VERSION } from '@fodr/contracts/terms'
import { authApp, client, signedInUser } from '../test/auth-app'
import { clearMail, linkIn, waitForMail } from '../test/mailpit'
import { SeedAccountRefused } from './repositories/accounts'
import { analysisRepository } from './repositories/analyses'
import { horseRepository } from './repositories/horses'
import { journalRepository } from './repositories/journal'
import { daysBefore, seedDemo } from './seed'

const { app, database, close } = authApp()
afterAll(close)

const { db } = database
const repos = {
  horses: horseRepository(db),
  analyses: analysisRepository(db),
  journal: journalRepository(db),
}
let counter = 0
const options = () => ({
  email: `seed${String(++counter)}-${String(Date.now())}@example.se`,
  password: 'seed-losenord-123',
  name: 'Demo',
  today: '2026-10-15',
})

async function contents(userId: string) {
  const user = { id: userId }
  const horses = await repos.horses.listFor(user)
  return Promise.all(
    horses.map(async (h) => ({
      namn: h.namn,
      analysis: (await repos.analyses.current(user, h.id))?.analys.labb ?? null,
      journal: ((await repos.journal.list(user, h.id)) ?? []).map((e) => [e.datum, e.viktKg]),
    })),
  )
}

describe('the seed', () => {
  it('creates the demo account with Sixten and Pysen, and seeding again changes nothing', async () => {
    const opts = options()
    const first = await seedDemo(db, opts)
    expect(first).toMatchObject({ accountCreated: true, horsesCreated: ['Sixten', 'Pysen'] })
    const seeded = await contents(first.userId)
    expect(seeded).toEqual([
      {
        namn: 'Sixten',
        analysis: 'Testlabb Alfa',
        journal: [
          ['2026-08-31', 570],
          ['2026-09-28', 558],
          ['2026-10-12', 550],
        ],
      },
      { namn: 'Pysen', analysis: null, journal: [['2026-10-01', 280]] },
    ])

    const second = await seedDemo(db, opts)
    expect(second).toEqual({ userId: first.userId, accountCreated: false, horsesCreated: [] })
    expect(await contents(first.userId)).toEqual(seeded)
  })

  it('makes an account that logs in with the seeded password', async () => {
    const opts = options()
    await seedDemo(db, opts)
    const browser = client(app, '10.29.0.1')
    const res = await browser.post('/api/auth/sign-in/email', { email: opts.email, password: opts.password })
    expect(res.status).toBe(200)
    expect(((await (await browser.request('/api/v1/me')).json()) as { user: { email: string } }).user.email).toBe(
      opts.email,
    )
  })

  it('brings back a horse the account no longer has, and only that one', async () => {
    const opts = options()
    const { userId } = await seedDemo(db, opts)
    const pysen = (await repos.horses.listFor({ id: userId })).find((h) => h.namn === 'Pysen')
    await repos.horses.remove({ id: userId }, pysen?.id ?? '')
    const again = await seedDemo(db, opts)
    expect(again.horsesCreated).toEqual(['Pysen'])
    expect((await contents(userId)).map((h) => h.namn)).toEqual(['Sixten', 'Pysen'])
  })

  it("leaves another account's horses alone, the same names too", async () => {
    const { browser } = await signedInUser(app, '10.29.0.2')
    await browser.post('/api/v1/horses', { ...(await import('../test/fixtures/horses')).SIXTEN, viktKg: 600 })
    const before = await (await browser.request('/api/v1/horses')).json()
    await seedDemo(db, options())
    expect(await (await browser.request('/api/v1/horses')).json()).toEqual(before)
  })
})

describe('the seed and accounts that are not its own', () => {
  it('refuses an account with another password, and adds nothing to it', async () => {
    const { email, browser } = await signedInUser(app, '10.29.0.3')
    await expect(seedDemo(db, { ...options(), email })).rejects.toEqual(new SeedAccountRefused('other_password'))
    expect(await (await browser.request('/api/v1/horses')).json()).toEqual({ horses: [] })
  })

  it('refuses an account whose email is not verified', async () => {
    const opts = options()
    const res = await client(app, '10.29.0.4').post('/api/auth/sign-up/email', {
      name: 'Ej verifierad',
      email: opts.email,
      password: opts.password,
      termsVersion: TERMS_VERSION,
      callbackURL: '/login',
    })
    expect(res.status).toBe(200)
    await expect(seedDemo(db, opts)).rejects.toEqual(new SeedAccountRefused('unverified'))
  })

  it('makes one account and one set of horses when two seeds run at once', async () => {
    const opts = options()
    const results = await Promise.all([seedDemo(db, opts), seedDemo(db, opts)])
    expect(results.map((r) => r.accountCreated).sort()).toEqual([false, true])
    expect((await contents(results[0].userId)).map((h) => h.namn)).toEqual(['Sixten', 'Pysen'])
  })

  it('makes an account whose password can be reset by email, as any other', async () => {
    const opts = options()
    await seedDemo(db, opts)
    await clearMail()
    const browser = client(app, '10.29.0.5')
    await browser.post('/api/auth/request-password-reset', { email: opts.email, redirectTo: '/reset-password' })
    const token = linkIn(await waitForMail(opts.email))
      .pathname.split('/')
      .at(-1)
    expect((await browser.post('/api/auth/reset-password', { token, newPassword: 'nytt-seed-losenord' })).status).toBe(
      200,
    )
    expect(
      (
        await client(app, '10.29.0.6').post('/api/auth/sign-in/email', {
          email: opts.email,
          password: 'nytt-seed-losenord',
        })
      ).status,
    ).toBe(200)
  })
})

describe('daysBefore', () => {
  it('counts calendar days back, across months and a clock change', () => {
    expect(daysBefore('2026-10-15', 45)).toBe('2026-08-31')
    expect(daysBefore('2026-10-27', 3)).toBe('2026-10-24')
    expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28')
  })
})
