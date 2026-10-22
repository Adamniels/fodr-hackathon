// The extraction eval's scoring (#34): a report reading compared with the colleague's answer key
// (testdata/Testdata-from-other-dev/krubba-testdata-v2/data/facit.json), and whether the run passes. Pure, so the gate's
// rules are unit tested; scripts/evaluate-analysis-reading.mjs calls the provider and prints the result, and CI runs it
// when the prompts, schemas or model change.
//
// A run fails on any invented value (a mineral the report does not have, returned anyway: the plan would trust it), on
// the reference report read as an analysis, or on a failed call. Otherwise it passes when at least the threshold share
// of the expected values are right: one near miss among a hundred values is model variance, not a broken prompt.
import type { AnalysisResponse } from './anthropic'

/**
 * The share of expected values a run must get right. The baseline when the gate was added (#34) was 126 of 128 (98.4 %,
 * the misses copper in B06, which the report rounds); raise it as the reading improves, never lower it to let a change
 * through.
 */
export const EVAL_THRESHOLD = 0.95

/** An answer key entry, as far as the eval reads it. */
export interface AnswerKeyEntry {
  forvantade_varden_per_kg_ts: {
    ts_pct: number
    aska: number
    oe_hast?: number
    smbrp_hast?: number
    socker?: number
    makro_g_per_kg_ts?: Record<string, number | null>
    spar_mg_per_kg_ts?: Record<string, number | null>
  }
}

type Expected = Record<string, number>

export interface ReadingResult {
  id: string
  correct: number
  total: number
  wrong: string[]
  invented: string[]
}
/** The reference report, which must not be read as an analysis. */
export interface RejectionResult {
  id: string
  rejected: boolean
}
export type CaseResult = ReadingResult | RejectionResult | { id: string; error: string }

export interface Verdict {
  pass: boolean
  correct: number
  total: number
  /** Why the run failed; empty when it passed. */
  reasons: string[]
}

const NUTRIENTS = { oe_hast: 'energi', smbrp_hast: 'smbRp', socker: 'socker' } as const
const MACRO = { Ca: 'ca', P: 'p', Mg: 'mg', Na: 'na' } as const
const TRACE = { Fe: 'fe', Mn: 'mn', Zn: 'zn', Cu: 'cu', Se: 'se' } as const
const TOP_LEVEL = new Set(['tsProcent', 'askaGPerKgTs'])

// Within 5 %, or an absolute margin for small values: the answer key is computed from unrounded values, so a report's
// rounding (copper in B06, per kg as fed) is not an error.
const isClose = (got: number | null | undefined, want: number) =>
  got != null && Math.abs(got - want) <= Math.max(0.05 * Math.abs(want), want < 1 ? 0.011 : 0.15)

/** The values a reading should have, by the reading's field names. */
export function expectedValues(answer: AnswerKeyEntry): Expected {
  const v = answer.forvantade_varden_per_kg_ts
  const expected: Expected = { tsProcent: v.ts_pct, askaGPerKgTs: v.aska }
  for (const [key, field] of Object.entries(NUTRIENTS)) {
    const value = v[key as keyof typeof NUTRIENTS]
    if (value != null) expected[field] = value
  }
  for (const [map, group] of [
    [MACRO, v.makro_g_per_kg_ts],
    [TRACE, v.spar_mg_per_kg_ts],
  ] as const) {
    for (const [key, field] of Object.entries(map)) {
      const value = group?.[key]
      if (value != null) expected[field] = value
    }
  }
  return expected
}

/** Whether the reference report, which is no analysis, was rejected. */
export function scoreRejection(id: string, reading: AnalysisResponse): RejectionResult {
  return { id, rejected: !reading.arAnalys }
}

/** One file's reading against its expected values. */
export function scoreReading(id: string, expected: Expected, reading: AnalysisResponse): ReadingResult {
  const perKgTs = reading.perKgTs as Record<string, number | null | undefined>
  const wrong: string[] = []
  let correct = 0
  for (const [field, want] of Object.entries(expected)) {
    const got = TOP_LEVEL.has(field) ? reading[field as 'tsProcent'] : perKgTs[field]
    if (isClose(got, want)) correct++
    else wrong.push(`${field}: got ${String(got)}, expected ${String(want)}`)
  }
  // A mineral the report does not have must be null: an invented value would reach the plan as if measured.
  const invented = [...Object.values(MACRO), ...Object.values(TRACE)]
    .filter((field) => !(field in expected) && perKgTs[field] != null)
    .map((field) => `${field}: ${String(perKgTs[field])}, not in the report`)
  return { id, correct, total: Object.keys(expected).length, wrong, invented }
}

export function verdict(results: CaseResult[], threshold: number): Verdict {
  const reasons: string[] = []
  let correct = 0
  let total = 0
  for (const r of results) {
    if ('error' in r) reasons.push(`${r.id}: the call failed (${r.error})`)
    else if ('rejected' in r) {
      if (!r.rejected) reasons.push(`${r.id}: read as an analysis, but is not one`)
    } else {
      correct += r.correct
      total += r.total
      for (const i of r.invented) reasons.push(`${r.id}: invented ${i}`)
    }
  }
  const share = total === 0 ? 1 : correct / total
  if (share < threshold) {
    reasons.push(
      `${String(correct)} of ${String(total)} values right (${pct(share)}), under the threshold ${pct(threshold)}`,
    )
  }
  return { pass: reasons.length === 0, correct, total, reasons }
}

const pct = (share: number) => `${(share * 100).toFixed(1)} %`

/** The run as markdown, for the CI job summary. */
export function summaryMarkdown(results: CaseResult[], v: Verdict): string {
  const share = v.total === 0 ? 1 : v.correct / v.total
  const lines = [
    `## Extraction eval: ${v.pass ? 'PASS' : 'FAIL'}`,
    '',
    `${String(v.correct)} of ${String(v.total)} values right (${pct(share)}).`,
    '',
    ...(v.reasons.length > 0 ? ['**Why it failed**', '', ...v.reasons.map((r) => `- ${r}`), ''] : []),
    '| File | Result | Details |',
    '|---|---|---|',
    ...results.map((r) => {
      if ('error' in r) return `| ${r.id} | call failed | ${r.error} |`
      if ('rejected' in r) return `| ${r.id} | ${r.rejected ? 'rejected' : 'NOT rejected'} | |`
      const details = [...r.invented.map((i) => `invented ${i}`), ...r.wrong].join('<br>')
      return `| ${r.id} | ${String(r.correct)}/${String(r.total)} | ${details} |`
    }),
  ]
  return lines.join('\n') + '\n'
}
