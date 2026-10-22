// CF8 export at API level (#40): GET /api/v1/me/export is a ZIP of everything the app holds about the signed-in user:
// the account, each horse's profile, analyses with the original reports, plans with their explanations and journal,
// and the user's AI usage. Only the user's own horses (ADR 0010). The AI is a fake; the database and file store are
// real.
import { strFromU8, unzipSync } from 'fflate'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { authApp, BASE_URL, signedInUser } from '../test/auth-app'
import type { FakeAiProvider } from '../test/fake-ai-provider'
import { EXPLANATION_REQUEST, PROFILE_REQUEST, PROFILE_RESPONSE } from '../test/fixtures/ai'
import { COMPLETE, PDF, READING } from '../test/fixtures/analyses'
import { PYSEN, SIXTEN } from '../test/fixtures/horses'
import { analyses } from './db/schema'

const harness = authApp()
const { app } = harness
const ai = harness.ai as FakeAiProvider
afterAll(harness.close)

let ipCounter = 0
const nextIp = () => `10.40.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`

/** A user with Sixten: an uploaded report, a plan saved to the journal with its explanation, and a profile AI call. */
async function userWithData() {
  const signedIn = await signedInUser(app, nextIp())
  const { browser } = signedIn
  ai.reset()
  ai.answer('readAnalysis', READING)
  ai.answer('explainPlan', 'En förklaring.')
  ai.answer('interpretProfile', PROFILE_RESPONSE)
  const horse = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
  const form = new FormData()
  form.set('file', new File([PDF], 'analys.pdf', { type: 'application/pdf' }))
  const analysis = (await (await browser.upload(`/api/v1/horses/${horse.id}/analyses`, form)).json()) as {
    id: string
  }
  const { plan } = (await (
    await browser.post(`/api/v1/horses/${horse.id}/plans`, { analysisId: analysis.id, journalDatum: '2026-10-22' })
  ).json()) as { plan: { id: string } }
  await browser.post(`/api/v1/horses/${horse.id}/plans/${plan.id}/explanation`, { request: EXPLANATION_REQUEST })
  await browser.post('/api/v1/ai/profile', PROFILE_REQUEST)
  return { ...signedIn, horse, analysis, plan }
}

async function exportOf(browser: Awaited<ReturnType<typeof signedInUser>>['browser']) {
  const res = await browser.request('/api/v1/me/export')
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('application/zip')
  expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="fodr-export-\d{4}-\d{2}-\d{2}\.zip"$/)
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
  const json = (name: string) => JSON.parse(strFromU8(files[name])) as unknown
  return { files, names: Object.keys(files).sort(), json }
}

describe('exporting my data', () => {
  it('holds the account, each horse with its analyses, reports, plans and journal, and the AI usage', async () => {
    const { browser, email, horse, analysis, plan } = await userWithData()
    const { files, names, json } = await exportOf(browser)
    const dir = `horses/sixten-${horse.id.slice(0, 8)}`
    expect(names).toEqual(
      [
        'README.txt',
        'account.json',
        'ai-usage.json',
        'sessions.json',
        `${dir}/analyses.json`,
        `${dir}/journal.json`,
        `${dir}/plans.json`,
        `${dir}/profile.json`,
        `${dir}/reports/${analysis.id}.pdf`,
      ].sort(),
    )
    // Exactly these fields: nothing else of the account (a password hash, a token) may ever slip in.
    expect(Object.keys(json('account.json') as object).sort()).toEqual(
      ['createdAt', 'email', 'emailVerified', 'id', 'name', 'role', 'updatedAt'].sort(),
    )
    expect(json('account.json')).toMatchObject({ email, name: 'Anna', emailVerified: true, role: 'user' })
    // The devices signed in, without the session token.
    const sessions = json('sessions.json') as Record<string, unknown>[]
    expect(sessions.length).toBeGreaterThan(0)
    expect(Object.keys(sessions[0]).sort()).toEqual(['createdAt', 'expiresAt', 'ipAddress', 'userAgent'].sort())
    expect(json(`${dir}/profile.json`)).toMatchObject({ id: horse.id, namn: 'Sixten' })
    // With the AI's own reading of the report, as it came.
    expect(json(`${dir}/analyses.json`)).toMatchObject([
      { id: analysis.id, hasFile: true, extracted: { tsProcent: 39.7 } },
    ])
    expect(json(`${dir}/plans.json`)).toMatchObject([
      { id: plan.id, explanation: { text: 'En förklaring.', model: 'test-model' } },
    ])
    expect(json(`${dir}/journal.json`)).toMatchObject([{ datum: '2026-10-22', plan: { planId: plan.id } }])
    // The report as it was uploaded, byte for byte.
    expect(Buffer.from(files[`${dir}/reports/${analysis.id}.pdf`])).toEqual(Buffer.from(PDF))
    const usage = json('ai-usage.json') as { route: string }[]
    expect(usage.map((u) => u.route).sort()).toEqual(['analysis', 'explanation', 'profile'])
    expect(strFromU8(files['README.txt'])).toContain('account.json')
  })

  it("never holds another user's horse", async () => {
    await userWithData()
    const { browser } = await signedInUser(app, nextIp())
    await browser.post('/api/v1/horses', PYSEN)
    const { names, json } = await exportOf(browser)
    expect(names.filter((n) => n.startsWith('horses/')).every((n) => n.startsWith('horses/pysen-'))).toBe(true)
    expect(json('ai-usage.json')).toEqual([])
  })

  it('keeps two horses of the same name apart, and shows a plan without an explanation as such', async () => {
    const { browser } = await signedInUser(app, nextIp())
    const first = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
    const second = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
    const analysis = (await (
      await browser.post(`/api/v1/horses/${first.id}/analyses`, { analys: COMPLETE })
    ).json()) as {
      id: string
    }
    await browser.post(`/api/v1/horses/${first.id}/plans`, { analysisId: analysis.id })
    const { names, json } = await exportOf(browser)
    expect(names).toContain(`horses/sixten-${first.id.slice(0, 8)}/profile.json`)
    expect(names).toContain(`horses/sixten-${second.id.slice(0, 8)}/profile.json`)
    expect(json(`horses/sixten-${first.id.slice(0, 8)}/plans.json`)).toMatchObject([{ explanation: null }])
  })

  it('is refused without a session', async () => {
    const res = await app.request(`${BASE_URL}/api/v1/me/export`)
    expect(res.status).toBe(401)
  })
})

describe('exporting when the file store fails a report', () => {
  // A store missing one object (an operations incident), and one that holds the first export open.
  let failFor: string | undefined
  let hold: Promise<void> | undefined
  const store = harness.files
  const flaky = authApp(
    {},
    {
      files: {
        put: (bytes, type) => store.put(bytes, type),
        remove: (keys) => store.remove(keys),
        open: async (key) => {
          if (hold) await hold
          if (key === failFor) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
          return store.open(key)
        },
      },
    },
  )
  afterAll(flaky.close)

  it('leaves the missing report out and lists it, rather than failing the export', async () => {
    const { browser } = await signedInUser(flaky.app, nextIp())
    ;(flaky.ai as FakeAiProvider).answer('readAnalysis', READING)
    const horse = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
    const form = new FormData()
    form.set('file', new File([PDF], 'analys.pdf', { type: 'application/pdf' }))
    const analysis = (await (await browser.upload(`/api/v1/horses/${horse.id}/analyses`, form)).json()) as {
      id: string
    }
    const [row] = await flaky.database.db
      .select({ key: analyses.fileKey })
      .from(analyses)
      .where(eq(analyses.id, analysis.id))
    failFor = row.key ?? undefined
    const { names, json } = await exportOf(browser)
    expect(names.some((n) => n.includes('/reports/'))).toBe(false)
    expect(json('missing-reports.json')).toEqual([{ horseId: horse.id, analysisId: analysis.id }])
    failFor = undefined
  })

  it('runs one export at a time for a user', async () => {
    const { browser } = await signedInUser(flaky.app, nextIp())
    ;(flaky.ai as FakeAiProvider).answer('readAnalysis', READING)
    const horse = (await (await browser.post('/api/v1/horses', SIXTEN)).json()) as { id: string }
    const form = new FormData()
    form.set('file', new File([PDF], 'analys.pdf', { type: 'application/pdf' }))
    await browser.upload(`/api/v1/horses/${horse.id}/analyses`, form)
    let release = () => {}
    hold = new Promise((resolve) => (release = resolve))
    const first = browser.request('/api/v1/me/export')
    // The first export is waiting on its report; a second one meanwhile is refused.
    await new Promise((resolve) => setTimeout(resolve, 100))
    const second = await browser.request('/api/v1/me/export')
    expect(second.status).toBe(429)
    expect(await second.json()).toMatchObject({ code: 'export.in_progress' })
    hold = undefined
    release()
    const done = await first
    expect(done.status).toBe(200)
    await done.arrayBuffer()
  })
})
