// CF8 deletion at API level (#41): a user who confirms with their password loses the account and everything of it at
// once (horses with their analyses, report files, plans, explanations and journal, the sessions and the login), and an
// email confirms it. Their AI usage stays, without them, as cost history (#31). Without the right password nothing
// happens. The AI is a fake; the database, file store and mail are real.
import { eq, inArray, like, or } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { authApp, BASE_URL, signedInUser } from '../test/auth-app'
import type { FakeAiProvider } from '../test/fake-ai-provider'
import { EXPLANATION_REQUEST, PROFILE_REQUEST, PROFILE_RESPONSE } from '../test/fixtures/ai'
import { PDF, READING } from '../test/fixtures/analyses'
import { PYSEN, SIXTEN } from '../test/fixtures/horses'
import { waitForMail } from '../test/mailpit'
import {
  accounts,
  aiUsage,
  analyses,
  horseMembers,
  horses,
  journalEntries,
  planExplanations,
  plans,
  sessions,
  users,
  verifications,
} from './db/schema'

const harness = authApp()
const { app, database, files } = harness
const ai = harness.ai as FakeAiProvider
afterAll(harness.close)
const db = database.db
const PASSWORD = 'hemligt-losenord-1'

let ipCounter = 0
const nextIp = () => `10.41.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`

/**
 * A user with two horses: Sixten with two uploaded reports (so an older analysis with its own file) and a plan saved to
 * the journal with its explanation, Pysen with one report; and a profile AI call.
 */
async function userWithData() {
  const signedIn = await signedInUser(app, nextIp())
  const { browser } = signedIn
  ai.answer('readAnalysis', READING)
  ai.answer('explainPlan', 'En förklaring.')
  ai.answer('interpretProfile', PROFILE_RESPONSE)
  const upload = async (horseId: string) => {
    const form = new FormData()
    form.set('file', new File([PDF], 'analys.pdf', { type: 'application/pdf' }))
    return (await (await browser.upload(`/api/v1/horses/${horseId}/analyses`, form)).json()) as { id: string }
  }
  const sixten = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
  const pysen = (await (await browser.post('/api/v1/horses', PYSEN)).json()) as { id: string }
  await upload(sixten.id)
  const analysis = await upload(sixten.id)
  await upload(pysen.id)
  const { plan } = (await (
    await browser.post(`/api/v1/horses/${sixten.id}/plans`, { analysisId: analysis.id, journalDatum: '2026-10-22' })
  ).json()) as { plan: { id: string } }
  await browser.post(`/api/v1/horses/${sixten.id}/plans/${plan.id}/explanation`, { request: EXPLANATION_REQUEST })
  await browser.post('/api/v1/ai/profile', PROFILE_REQUEST)
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, signedIn.email))
  const horseIds = [sixten.id, pysen.id]
  const fileKeys = (
    await db.select({ key: analyses.fileKey }).from(analyses).where(inArray(analyses.horseId, horseIds))
  ).map((a) => a.key ?? '')
  expect(fileKeys).toHaveLength(3)
  return { ...signedIn, userId: user.id, horseIds, planId: plan.id, fileKeys }
}

/** Every row of the user's that deletion must remove, counted per table. */
async function rowsOf(userId: string, email: string, horseIds: string[], planId: string) {
  const count = async (rows: Promise<unknown[]>) => (await rows).length
  return {
    users: await count(db.select().from(users).where(eq(users.id, userId))),
    sessions: await count(db.select().from(sessions).where(eq(sessions.userId, userId))),
    accounts: await count(db.select().from(accounts).where(eq(accounts.userId, userId))),
    horseMembers: await count(db.select().from(horseMembers).where(eq(horseMembers.userId, userId))),
    horses: await count(db.select().from(horses).where(inArray(horses.id, horseIds))),
    analyses: await count(db.select().from(analyses).where(inArray(analyses.horseId, horseIds))),
    plans: await count(db.select().from(plans).where(inArray(plans.horseId, horseIds))),
    explanations: await count(db.select().from(planExplanations).where(eq(planExplanations.planId, planId))),
    journal: await count(db.select().from(journalEntries).where(inArray(journalEntries.horseId, horseIds))),
    // A pending password reset holds the user's ID, a pending login link the email (#41).
    verifications: await count(
      db
        .select()
        .from(verifications)
        .where(or(eq(verifications.value, userId), like(verifications.value, `%${email}%`))),
    ),
  }
}

const deleteAccount = (browser: Awaited<ReturnType<typeof signedInUser>>['browser'], body: object) =>
  browser.post('/api/auth/delete-user', body)

describe('deleting my account', () => {
  it('removes the account and everything of it, keeps the AI usage without me, and confirms by email', async () => {
    const { browser, email, userId, horseIds, planId, fileKeys } = await userWithData()
    for (const key of fileKeys) expect(await files.has(key)).toBe(true)
    // A pending password reset and a pending login link, whose rows hold the user's ID and email.
    await app.request(`${BASE_URL}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL, 'x-forwarded-for': nextIp() },
      body: JSON.stringify({ email, redirectTo: '/reset-password' }),
    })
    await app.request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL, 'x-forwarded-for': nextIp() },
      body: JSON.stringify({ email }),
    })
    await expect.poll(async () => (await rowsOf(userId, email, horseIds, planId)).verifications).toBe(2)
    const usageIds = (await db.select({ id: aiUsage.id }).from(aiUsage).where(eq(aiUsage.userId, userId))).map(
      (u) => u.id,
    )
    // Three report readings, an explanation and a profile fill.
    expect(usageIds).toHaveLength(5)

    const res = await deleteAccount(browser, { password: PASSWORD })
    expect(res.status).toBe(200)

    expect(await rowsOf(userId, email, horseIds, planId)).toEqual({
      users: 0,
      sessions: 0,
      accounts: 0,
      horseMembers: 0,
      horses: 0,
      analyses: 0,
      plans: 0,
      explanations: 0,
      journal: 0,
      verifications: 0,
    })
    for (const key of fileKeys) expect(await files.has(key)).toBe(false)
    // The cost history stays, anonymous: the same rows, no longer anyone's.
    const kept = await db.select({ userId: aiUsage.userId }).from(aiUsage).where(inArray(aiUsage.id, usageIds))
    expect(kept).toEqual(usageIds.map(() => ({ userId: null })))
    expect(await waitForMail(email, 5000, 'Ditt konto hos Fodr är raderat')).toMatchObject({
      text: expect.stringContaining('Ditt konto hos Fodr är raderat') as unknown,
    })
    // The session went with the account.
    expect((await browser.request('/api/v1/me')).status).toBe(401)
  })

  it('deletes nothing without the password, with an empty one, a token instead, or a wrong one', async () => {
    const { browser, email, userId, horseIds, planId } = await userWithData()
    const before = await rowsOf(userId, email, horseIds, planId)
    for (const body of [{}, { password: '' }, { token: 'abc' }, { password: 'fel-losenord-123' }]) {
      expect((await deleteAccount(browser, body)).status).toBe(400)
    }
    expect(await rowsOf(userId, email, horseIds, planId)).toEqual(before)
    expect((await browser.request('/api/v1/me')).status).toBe(200)
  })

  it("leaves another user's horses alone", async () => {
    const other = await signedInUser(app, nextIp())
    const pysen = (await (await other.browser.post('/api/v1/horses', PYSEN)).json()) as { id: string }
    const { browser } = await userWithData()
    expect((await deleteAccount(browser, { password: PASSWORD })).status).toBe(200)
    expect((await other.browser.request(`/api/v1/horses/${pysen.id}`)).status).toBe(200)
  })

  it('takes at most five password guesses a minute, as signing in does', async () => {
    const { browser } = await signedInUser(app, nextIp())
    for (let i = 0; i < 5; i++)
      expect((await deleteAccount(browser, { password: 'fel-losenord-123' })).status).toBe(400)
    expect((await deleteAccount(browser, { password: 'fel-losenord-123' })).status).toBe(429)
  })
})
