// Compares the AI reading against the colleague's answer key, calling the provider the API uses directly (#30), so no
// server is needed. Needs ANTHROPIC_API_KEY (the root .env locally, a secret in CI) and reads AI_MODEL like the API.
// Usage: npm run eval:analysis -w apps/api [-- testdata-v2-dir]
// Costs one API call per file (11). Exits 1 when the run fails the gate (src/ai/eval.ts: an invented value, the
// reference report read as an analysis, a failed call, or too few values right); CI runs it when the prompts, schemas
// or model change (#34) and puts the summary in the job summary.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAnthropicProvider, DEFAULT_MODEL } from '../src/ai/anthropic.ts'
import {
  EVAL_THRESHOLD,
  expectedValues,
  scoreReading,
  scoreRejection,
  summaryMarkdown,
  verdict,
} from '../src/ai/eval.ts'

const dataDir =
  process.argv[2] ?? new URL('../../../testdata/Testdata-from-other-dev/krubba-testdata-v2', import.meta.url).pathname
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set: add it to the root .env, or as a GitHub Actions secret for CI.')
  process.exit(1)
}
const model = process.env.AI_MODEL || DEFAULT_MODEL
const ai = createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model })
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

async function run(f) {
  const data = readFileSync(join(dataDir, f.file)).toString('base64')
  const mediaType = f.file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
  const t0 = Date.now()
  try {
    const { value: reading } = await ai.readAnalysis({ mediaType, base64: data })
    const seconds = ((Date.now() - t0) / 1000).toFixed(1)
    const result = f.answer ? scoreReading(f.id, expectedValues(f.answer), reading) : scoreRejection(f.id, reading)
    return { ...result, seconds, type: reading.typ }
  } catch (e) {
    return { id: f.id, error: e instanceof Error ? e.message : String(e) }
  }
}

const results = []
for (let i = 0; i < files.length; i += 4) results.push(...(await Promise.all(files.slice(i, i + 4).map(run))))
for (const r of results) {
  if ('error' in r) console.log(`FAIL ${r.id}: the call failed (${r.error})`)
  else if ('rejected' in r)
    console.log(`${r.rejected ? 'OK  ' : 'FAIL'} ${r.id} (${r.seconds} s) rejected=${r.rejected}`)
  else {
    const ok = r.wrong.length === 0 && r.invented.length === 0
    console.log(`${ok ? 'OK  ' : 'MISS'} ${r.id} (${r.seconds} s) ${r.correct}/${r.total} values, type ${r.type}`)
    for (const line of [...r.invented.map((i) => `invented ${i}`), ...r.wrong]) console.log('     ' + line)
  }
}
const result = verdict(results, EVAL_THRESHOLD)
console.log(`\nModel ${model}: ${result.pass ? 'PASS' : 'FAIL'}, ${result.correct} of ${result.total} values right`)
for (const reason of result.reasons) console.log(`  ${reason}`)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Model \`${model}\`\n\n` + summaryMarkdown(results, result))
}
process.exit(result.pass ? 0 : 1)
