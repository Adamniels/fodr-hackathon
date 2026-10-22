import { describe, expect, it } from 'vitest'
import type { AnalysisResponse } from './anthropic'
import { expectedValues, scoreReading, scoreRejection, summaryMarkdown, verdict } from './eval'

// The extraction eval's scoring (#34): a reading is compared with the answer key, and the run passes only with no
// invented value, the reference report rejected, no failed call, and enough values right.

const ANSWER = {
  forvantade_varden_per_kg_ts: {
    ts_pct: 39.7,
    aska: 71,
    oe_hast: 10.2,
    smbrp_hast: 104,
    socker: 61,
    makro_g_per_kg_ts: { Ca: 5.3, P: 2.66 },
    spar_mg_per_kg_ts: { Se: 0.03 },
  },
}

const reading = (perKgTs: Record<string, number | null>, overrides: Partial<AnalysisResponse> = {}) =>
  ({
    arAnalys: true,
    typ: 'hosilage',
    tsProcent: 39.7,
    askaGPerKgTs: 71,
    perKgTs: { energi: 10.2, smbRp: 104, socker: 61, ca: 5.3, p: 2.66, se: 0.03, ...perKgTs },
    anmarkningar: [],
    ...overrides,
  }) as unknown as AnalysisResponse

describe('the extraction eval (#34)', () => {
  it('maps the answer key to the reading fields', () => {
    expect(expectedValues(ANSWER)).toEqual({
      tsProcent: 39.7,
      askaGPerKgTs: 71,
      energi: 10.2,
      smbRp: 104,
      socker: 61,
      ca: 5.3,
      p: 2.66,
      se: 0.03,
    })
  })

  it('counts a value within the tolerance as right, and one outside it as wrong', () => {
    const result = scoreReading('A01', expectedValues(ANSWER), reading({ energi: 10.4, ca: 6.5 }))
    expect(result).toMatchObject({ correct: 7, total: 8, invented: [] })
    expect(result.wrong).toEqual(['ca: got 6.5, expected 5.3'])
  })

  it('fails a run with an invented value, even when every expected value is right', () => {
    const results = [scoreReading('A01', expectedValues(ANSWER), reading({ zn: 32 }))]
    expect(results[0].invented).toEqual(['zn: 32, not in the report'])
    expect(verdict(results, 0.9)).toMatchObject({ pass: false })
  })

  it('fails a run in which the reference report is read as an analysis', () => {
    const accepted = scoreRejection('R00', reading({}))
    const rejected = scoreRejection('R00', reading({}, { arAnalys: false }))
    expect(verdict([accepted], 0.9)).toMatchObject({ pass: false })
    expect(verdict([rejected], 0.9)).toMatchObject({ pass: true })
  })

  it('fails a run with a failed call', () => {
    expect(verdict([{ id: 'A01', error: 'upstream 500' }], 0.9)).toMatchObject({ pass: false })
  })

  it('passes at the threshold share of right values, and fails under it', () => {
    const expected = expectedValues(ANSWER)
    const oneWrong = scoreReading('A01', expected, reading({ ca: 9 }))
    // 7 of 8 values right: 0.875.
    expect(verdict([oneWrong], 0.875)).toMatchObject({ pass: true, correct: 7, total: 8 })
    expect(verdict([oneWrong], 0.9)).toMatchObject({ pass: false })
  })

  it('says in the summary why a run failed', () => {
    const results = [scoreReading('A01', expectedValues(ANSWER), reading({ zn: 32 }))]
    const summary = summaryMarkdown(results, verdict(results, 0.9))
    expect(summary).toContain('FAIL')
    expect(summary).toContain('zn: 32, not in the report')
  })
})
