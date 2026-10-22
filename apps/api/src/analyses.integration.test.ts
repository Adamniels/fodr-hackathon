// CF4 at API level (#26): analyses per horse, the report in the file store (ADR 0011), the values in Postgres, every
// query through the horse's membership (ADR 0010). The AI is a fake; the database and the file store are real.
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { authApp, signedInUser } from '../test/auth-app'
import type { FakeAiProvider } from '../test/fake-ai-provider'
import { JPEG, PDF, PNG, READING, WEBP } from '../test/fixtures/analyses'
import { SIXTEN } from '../test/fixtures/horses'
import { AiProviderError, type AiProvider } from './ai/provider'
import { analyses } from './db/schema'
import type { FileStore } from './storage'

const harness = authApp()
const { app, database, files } = harness
const ai = harness.ai as FakeAiProvider
afterAll(harness.close)
beforeEach(() => {
  ai.reset()
  ai.answer('readAnalysis', READING)
})

let ipCounter = 0
const nextIp = () => `10.26.${String(Math.floor(++ipCounter / 250))}.${String(ipCounter % 250)}`
type Browser = Awaited<ReturnType<typeof signedInUser>>['browser']

async function userWithHorse(target = app) {
  const { browser } = await signedInUser(target, nextIp())
  const res = await browser.post('/api/v1/horses', SIXTEN)
  const { id } = (await res.json()) as { id: string }
  return { browser, horseId: id, base: `/api/v1/horses/${id}/analyses` }
}

const form = (bytes: Uint8Array, type = 'application/pdf', name = 'analys.pdf') => {
  const data = new FormData()
  data.set('file', new File([bytes], name, { type }))
  return data
}

interface AnalysisBody {
  id: string
  analys: { tsProcent: number; perKgTs: Record<string, number>; labb?: string }
  omrakningar: { amne: string }[]
  anmarkningar: string[]
  hasFile: boolean
}

const current = async (browser: Browser, base: string) =>
  ((await (await browser.request(`${base}/current`)).json()) as { analysis: AnalysisBody | null }).analysis

const rowsOf = (horseId: string) => database.db.select().from(analyses).where(eq(analyses.horseId, horseId))

describe('uploading a report', () => {
  it('reads the file with the AI, stores it and the converted values, and makes it current', async () => {
    const { browser, horseId, base } = await userWithHorse()
    expect(await current(browser, base)).toBeNull()

    const res = await browser.upload(base, form(PDF))
    expect(res.status).toBe(201)
    const analysis = (await res.json()) as AnalysisBody
    expect(analysis.hasFile).toBe(true)
    expect(analysis.analys.tsProcent).toBe(39.7)
    expect(analysis.analys.labb).toBe('Labb A')
    // The crude protein is converted by the domain (SLU), never by the AI, and says so.
    expect(analysis.omrakningar.map((o) => o.amne)).toEqual(['smbRp'])
    expect(analysis.anmarkningar).toEqual(['Selen svårläst'])
    expect(await current(browser, base)).toEqual(analysis)

    // The AI got the very bytes that were stored, with the type their magic bytes show.
    expect(ai.calls).toEqual([
      {
        method: 'readAnalysis',
        input: { mediaType: 'application/pdf', base64: Buffer.from(PDF).toString('base64') },
      },
    ])
    const [row] = await rowsOf(horseId)
    expect(row.fileKey).toMatch(/^analyses\/[0-9a-f-]{36}$/)
    expect(row.sampledOn).toBe('2026-06-10')
    expect(await files.has(row.fileKey ?? '')).toBe(true)
  })

  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/webp', WEBP],
  ])('accepts a photo, %s', async (type, bytes) => {
    const { browser, base } = await userWithHorse()
    // The type comes from the bytes, not from what the browser claimed.
    const res = await browser.upload(base, form(bytes, 'application/octet-stream', 'foto'))
    expect(res.status).toBe(201)
    expect(ai.calls[0].input).toMatchObject({ mediaType: type })
  })

  it('makes a newer analysis current and keeps the older one', async () => {
    const { browser, horseId, base } = await userWithHorse()
    const first = (await (await browser.upload(base, form(PDF))).json()) as AnalysisBody
    ai.answer('readAnalysis', { ...READING, tsProcent: 85 })
    const second = (await (await browser.upload(base, form(PDF))).json()) as AnalysisBody
    expect((await current(browser, base))?.id).toBe(second.id)
    const rows = await rowsOf(horseId)
    expect(rows.map((r) => [r.id, r.isCurrent]).sort()).toEqual(
      [
        [first.id, false],
        [second.id, true],
      ].sort(),
    )
  })

  it('refuses a file that is not a PDF or a photo, whatever it claims, before the AI reads it', async () => {
    const { browser, base } = await userWithHorse()
    const res = await browser.upload(base, form(new TextEncoder().encode('just text'), 'application/pdf'))
    expect(res.status).toBe(415)
    expect(await res.json()).toMatchObject({ code: 'analysis.unsupported_type' })
    expect(ai.calls).toEqual([])
  })

  it('refuses a photo over 5 MB before the AI reads it', async () => {
    const { browser, base } = await userWithHorse()
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    big.set(PNG)
    const res = await browser.upload(base, form(big, 'image/png'))
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ code: 'analysis.too_large' })
    expect(ai.calls).toEqual([])
  })

  it('accepts a PDF over 5 MB, under its own limit of 20 MB', async () => {
    const { browser, base } = await userWithHorse()
    const big = new Uint8Array(6 * 1024 * 1024)
    big.set(PDF)
    expect((await browser.upload(base, form(big))).status).toBe(201)
  })

  it('refuses an upload sent from another origin, which a form on another page could do', async () => {
    const { browser, base } = await userWithHorse()
    const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    for (const origin of ['https://elak.example', undefined]) {
      const res = await app.request(`http://localhost:3000${base}`, {
        method: 'POST',
        headers: { cookie, 'x-forwarded-for': nextIp(), ...(origin && { origin }) },
        body: form(PDF),
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ code: 'request.forbidden_origin' })
    }
    expect(ai.calls).toEqual([])
  })

  it('refuses a request without a file', async () => {
    const { browser, base } = await userWithHorse()
    const res = await browser.upload(base, new FormData())
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'validation.invalid' })
  })

  it('stores nothing when the document is not a feed analysis', async () => {
    const { browser, horseId, base } = await userWithHorse()
    ai.answer('readAnalysis', { ...READING, arAnalys: false })
    const res = await browser.upload(base, form(PDF))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'analysis.notAnAnalysis' })
    expect(await rowsOf(horseId)).toEqual([])
  })

  it('stores nothing when the report gives no dry matter', async () => {
    const { browser, horseId, base } = await userWithHorse()
    ai.answer('readAnalysis', { ...READING, tsProcent: null })
    const res = await browser.upload(base, form(PDF))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'analysis.missingDryMatter' })
    expect(await rowsOf(horseId)).toEqual([])
  })

  it('says when the AI is busy or failing, and stores nothing', async () => {
    const { browser, horseId, base } = await userWithHorse()
    ai.fail('readAnalysis', new AiProviderError('rate_limit', 429))
    const busy = await browser.upload(base, form(PDF))
    expect(busy.status).toBe(429)
    expect(await busy.json()).toMatchObject({ code: 'ai.rate_limited' })
    ai.fail('readAnalysis', new AiProviderError('upstream', 500))
    const failing = await browser.upload(base, form(PDF))
    expect(failing.status).toBe(502)
    expect(await failing.json()).toMatchObject({ code: 'ai.unavailable' })
    expect(await rowsOf(horseId)).toEqual([])
  })

  it("never reads a report for another user's horse", async () => {
    const { base } = await userWithHorse()
    const { browser: other } = await signedInUser(app, nextIp())
    const res = await other.upload(base, form(PDF))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'horse.not_found' })
    expect(ai.calls).toEqual([])
  })

  it('deletes the stored file again when the horse is gone before the analysis is saved', async () => {
    const removed: string[][] = []
    let deleteHorse = () => Promise.resolve()
    // The horse is deleted while the AI reads, so the file is stored but the row cannot be.
    const slowAi: AiProvider = {
      ...ai,
      readAnalysis: async () => {
        await deleteHorse()
        return READING
      },
    }
    const recording: FileStore = {
      put: (bytes, type) => files.put(bytes, type),
      // The horse's own delete removes its (no) files too; only the upload's cleanup is of interest.
      remove: async (keys) => {
        if (keys.length > 0) removed.push(keys)
        await files.remove(keys)
      },
    }
    const other = authApp({}, { ai: slowAi, files: recording })
    try {
      const { browser, base, horseId } = await userWithHorse(other.app)
      deleteHorse = async () => {
        await browser.request(`/api/v1/horses/${horseId}`, { method: 'DELETE' })
      }
      const res = await browser.upload(base, form(PDF))
      expect(res.status).toBe(404)
      expect(removed).toHaveLength(1)
      expect(await files.has(removed[0][0])).toBe(false)
    } finally {
      await other.close()
    }
  })

  it('saves no row when the file cannot be stored', async () => {
    const broken: FileStore = { put: () => Promise.reject(new Error('store down')), remove: () => Promise.resolve() }
    const other = authApp({}, { files: broken })
    try {
      ;(other.ai as FakeAiProvider).answer('readAnalysis', READING)
      const { browser, base, horseId } = await userWithHorse(other.app)
      expect((await browser.upload(base, form(PDF))).status).toBe(500)
      expect(await rowsOf(horseId)).toEqual([])
    } finally {
      await other.close()
    }
  })
})

describe('an analysis without a file', () => {
  const analys = { typ: 'ho', tsProcent: 85, perKgTs: { energi: 9, smbRp: 70 } }

  it('is stored as sent and becomes current', async () => {
    const { browser, base } = await userWithHorse()
    const res = await browser.post(base, { analys })
    expect(res.status).toBe(201)
    const analysis = (await res.json()) as AnalysisBody
    expect(analysis).toMatchObject({ analys, omrakningar: [], anmarkningar: [], hasFile: false })
    expect(await current(browser, base)).toEqual(analysis)
    expect(ai.calls).toEqual([])
  })

  it("is 404 for another user's horse", async () => {
    const { base } = await userWithHorse()
    const { browser: other } = await signedInUser(app, nextIp())
    const res = await other.post(base, { analys })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'horse.not_found' })
  })

  it('keeps one current analysis when several are created at once (a double click)', async () => {
    const { browser, horseId, base } = await userWithHorse()
    const results = await Promise.all(Array.from({ length: 5 }, () => browser.post(base, { analys })))
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201])
    const rows = await rowsOf(horseId)
    expect(rows).toHaveLength(5)
    expect(rows.filter((r) => r.isCurrent)).toHaveLength(1)
  })

  it('refuses a JSON body larger than an analysis can be, before reading it', async () => {
    const { browser, base } = await userWithHorse()
    const res = await browser.post(base, { analys: { ...analys, labb: 'x'.repeat(70 * 1024) } })
    expect(res.status).toBe(413)
  })

  it('is refused when the domain refuses its values', async () => {
    const { browser, base } = await userWithHorse()
    const res = await browser.post(base, { analys: { ...analys, tsProcent: 0 } })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      code: 'validation.invalid',
      errors: [{ path: 'analys.tsProcent', code: 'validation.range' }],
    })
  })
})

describe('correcting the values', () => {
  async function uploaded() {
    const user = await userWithHorse()
    const analysis = (await (await user.browser.upload(user.base, form(PDF))).json()) as AnalysisBody
    return { ...user, analysis, values: `${user.base}/${analysis.id}/values` }
  }

  it('saves corrected values, dropping the conversion of a value the owner typed', async () => {
    const { browser, base, analysis, values } = await uploaded()
    const analys = { ...analysis.analys, perKgTs: { ...analysis.analys.perKgTs, smbRp: 99 } }
    const res = await browser.request(values, { method: 'PUT', body: { analys, omrakningar: [] } })
    expect(res.status).toBe(200)
    expect(await current(browser, base)).toMatchObject({ id: analysis.id, analys, omrakningar: [] })
  })

  it('keeps the stored conversion, never the values a client sends for it', async () => {
    const { browser, analysis, values } = await uploaded()
    const [stored] = analysis.omrakningar as { amne: string; message: { params: Record<string, number> } }[]
    const res = await browser.request(values, {
      method: 'PUT',
      body: {
        analys: analysis.analys,
        omrakningar: [{ ...stored, message: { code: 'conversion.proteinFromCrude', params: { grams: 999 } } }],
      },
    })
    expect(((await res.json()) as AnalysisBody).omrakningar).toEqual([stored])
  })

  it('moves the sampling date along with a corrected one', async () => {
    const { browser, horseId, analysis, values } = await uploaded()
    const analys = { ...analysis.analys, provdatum: '2026-07-01' }
    await browser.request(values, { method: 'PUT', body: { analys, omrakningar: analysis.omrakningar } })
    const [row] = await rowsOf(horseId)
    expect(row.sampledOn).toBe('2026-07-01')
  })

  it('keeps no conversion the analysis never had', async () => {
    const { browser, analysis, values } = await uploaded()
    const res = await browser.request(values, {
      method: 'PUT',
      body: {
        analys: analysis.analys,
        omrakningar: [
          ...analysis.omrakningar,
          { amne: 'energi', message: { code: 'conversion.energyFromRuminant', params: { mj: 1 } } },
        ],
      },
    })
    expect(((await res.json()) as AnalysisBody).omrakningar.map((o) => o.amne)).toEqual(['smbRp'])
  })

  it.each([
    ['dry matter above 100 %', { tsProcent: 101 }, 'analys.tsProcent', 'validation.range'],
    ['a negative nutrient', { perKgTs: { ca: -1 } }, 'analys.perKgTs.ca', 'validation.atLeast'],
  ])('refuses %s (CF4)', async (_name, change, path, code) => {
    const { browser, base, analysis, values } = await uploaded()
    const res = await browser.request(values, {
      method: 'PUT',
      body: { analys: { ...analysis.analys, ...change }, omrakningar: [] },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'validation.invalid', errors: [{ path, code }] })
    expect(await current(browser, base)).toEqual(analysis)
  })

  it('refuses a value that is not a number', async () => {
    const { browser, analysis, values } = await uploaded()
    const res = await browser.request(values, {
      method: 'PUT',
      body: { analys: { ...analysis.analys, tsProcent: 'fyrtio' }, omrakningar: [] },
    })
    expect(res.status).toBe(400)
  })

  it("is 404 for another user's analysis and for an analysis of another horse", async () => {
    const { analysis, values } = await uploaded()
    const { browser: other } = await signedInUser(app, nextIp())
    const body = { analys: analysis.analys, omrakningar: [] }
    expect((await other.request(values, { method: 'PUT', body })).status).toBe(404)

    const { browser, base: otherHorse } = await userWithHorse()
    const mine = (await (await browser.upload(otherHorse, form(PDF))).json()) as AnalysisBody
    const second = await browser.post('/api/v1/horses', SIXTEN)
    const { id } = (await second.json()) as { id: string }
    const res = await browser.request(`/api/v1/horses/${id}/analyses/${mine.id}/values`, { method: 'PUT', body })
    expect(res.status).toBe(404)
  })
})

describe('reading the current analysis', () => {
  it("is 404 for another user's horse", async () => {
    const { base } = await userWithHorse()
    const { browser: other } = await signedInUser(app, nextIp())
    expect((await other.request(`${base}/current`)).status).toBe(404)
  })
})

describe('deleting a horse', () => {
  it('deletes its analyses and their files', async () => {
    const { browser, horseId, base } = await userWithHorse()
    await browser.upload(base, form(PDF))
    await browser.upload(base, form(PNG, 'image/png'))
    const keys = (await rowsOf(horseId)).map((r) => r.fileKey ?? '')
    expect(keys).toHaveLength(2)

    expect((await browser.request(`/api/v1/horses/${horseId}`, { method: 'DELETE' })).status).toBe(204)
    expect(await rowsOf(horseId)).toEqual([])
    for (const key of keys) expect(await files.has(key)).toBe(false)
  })
})
