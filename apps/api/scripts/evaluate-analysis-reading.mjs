// Compares the AI reading against the colleague's answer key, calling the provider the API uses directly (#30), so no
// server is needed. Needs ANTHROPIC_API_KEY in the root .env.
// Usage: npm run eval:analysis -w apps/api [-- testdata-v2-dir]
// Costs one API call per file (11). The answer key is computed from unrounded values, so small rounding differences
// in reports per kg as fed (e.g. copper in B06) are expected.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAnthropicProvider } from '../src/ai/anthropic.ts'

const dataDir =
  process.argv[2] ?? new URL('../../../testdata/Testdata-from-other-dev/krubba-testdata-v2', import.meta.url).pathname
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set: add it to the root .env.')
  process.exit(1)
}
const ai = createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
const answerKey = JSON.parse(readFileSync(join(dataDir, 'data/facit.json'), 'utf8')).analyser
const files = [
  ...answerKey.map((a) => ({ id: a.id, file: a.fil, answer: a })),
  ...['A01-medel-skord1', 'B04-hoga-socker-ho', 'B06-tredje-skord-hog-aska'].map((id) => ({
    id: id + ' (mobilfoto)',
    file: `bilder/${id}-mobilfoto.jpg`,
    answer: answerKey.find((a) => a.id === id),
  })),
  { id: 'R00 (ska avvisas)', file: 'pdf/R00-referens-sverigestatistik-2026.pdf', answer: null },
]
const MAP = { oe_hast: 'energi', smbrp_hast: 'smbRp', socker: 'socker' }
const MACRO = { Ca: 'ca', P: 'p', Mg: 'mg', Na: 'na' }
const TRACE = { Fe: 'fe', Mn: 'mn', Zn: 'zn', Cu: 'cu', Se: 'se' }
const isClose = (a, b) => a != null && Math.abs(a - b) <= Math.max(0.05 * Math.abs(b), b < 1 ? 0.011 : 0.15)

async function run(f) {
  const data = readFileSync(join(dataDir, f.file)).toString('base64')
  const mediaType = f.file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
  const t0 = Date.now()
  const reply = await ai.readAnalysis({ mediaType, base64: data })
  const seconds = ((Date.now() - t0) / 1000).toFixed(1)
  if (!f.answer) return { id: f.id, seconds, ok: reply.arAnalys === false, detail: `arAnalys=${reply.arAnalys}` }
  const v = f.answer.forvantade_varden_per_kg_ts
  const expected = { tsProcent: v.ts_pct, askaGPerKgTs: v.aska }
  for (const [k, m] of Object.entries(MAP)) expected[m] = v[k]
  for (const [k, m] of Object.entries(MACRO)) if (v.makro_g_per_kg_ts?.[k] != null) expected[m] = v.makro_g_per_kg_ts[k]
  for (const [k, m] of Object.entries(TRACE)) if (v.spar_mg_per_kg_ts?.[k] != null) expected[m] = v.spar_mg_per_kg_ts[k]
  const errors = []
  let correct = 0
  for (const [k, want] of Object.entries(expected)) {
    const got = k === 'tsProcent' || k === 'askaGPerKgTs' ? reply[k] : reply.perKgTs?.[k]
    if (isClose(got, want)) correct++
    else errors.push(`${k}: fick ${got}, facit ${want}`)
  }
  // Nutrients not in the report must be null.
  for (const m of [...Object.values(MACRO), ...Object.values(TRACE)]) {
    if (expected[m] === undefined && reply.perKgTs?.[m] != null)
      errors.push(`${m}: hittade på ${reply.perKgTs[m]}, ska vara null`)
  }
  return {
    id: f.id,
    seconds,
    ok: errors.length === 0,
    correct,
    total: Object.keys(expected).length,
    errors,
    type: reply.typ,
    notes: reply.anmarkningar,
  }
}

const results = []
for (let i = 0; i < files.length; i += 4) results.push(...(await Promise.all(files.slice(i, i + 4).map(run))))
for (const r of results) {
  console.log(
    `${r.ok ? 'OK ' : 'FEL'} ${r.id} (${r.seconds} s)${r.total ? ` ${r.correct}/${r.total} värden, typ ${r.type}` : ' ' + r.detail}`,
  )
  for (const f of r.errors ?? []) console.log('     ' + f)
}
