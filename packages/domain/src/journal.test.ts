import { describe, expect, it } from 'vitest'
import { demoJournal } from '../test/fixtures/examples'
import { beraknaTrend, ogonblickAvPlan, type Journalpost } from './journal'

const post = (datum: string, viktKg?: number, hull?: number): Journalpost => ({
  id: datum,
  datum,
  viktKg,
  hull,
  text: '',
})

describe('beraknaTrend', () => {
  it('Sixtens demojournal: 570 till 550 kg på 6 veckor, under 1 % per vecka', () => {
    const t = beraknaTrend(demoJournal['demo-sixten'], '2026-10-14')
    expect(t.vikt).toMatchObject({ forsta: 570, senaste: 550, dagar: 42 })
    // −20/570 = −3,5 % på 6 veckor, −0,58 % per vecka
    expect(t.vikt!.procentPerVecka).toBeCloseTo(-0.58, 2)
    expect(t.hull).toEqual({ forsta: 8, senaste: 7 })
    expect(t.varningar).toEqual([])
    expect(t.nastaUppfoljning).toBe('2026-11-09')
    expect(t.uppfoljningForfallen).toBe(false)
  })
  it('varnar för viktnedgång över 1 % per vecka', () => {
    const t = beraknaTrend([post('2026-09-01', 500), post('2026-09-15', 480)], '2026-09-20')
    expect(t.varningar).toHaveLength(1)
    expect(t.varningar[0].code).toBe('trend.weightLossFast')
    // 500 → 480 kg på två veckor: −4 % / 14 dagar × 7 = 2 % per vecka, som en positiv nedgång.
    expect(t.varningar[0].params.percentPerWeek).toBeCloseTo(2, 10)
  })
  it('varnar när hullet ökar från överhull', () => {
    const t = beraknaTrend([post('2026-09-01', undefined, 6), post('2026-10-01', undefined, 7)], '2026-10-02')
    expect(t.varningar).toEqual([{ code: 'trend.conditionRising', params: {} }])
  })
  it('ögonblicksbilden sparar analystexten som webben ger, och räknar inget språk själv (ADR 0014)', () => {
    const o = ogonblickAvPlan({ grovfoderKgPerDag: 9.04, behallnaFoder: [], urval: null }, 'Hö, Labb, 2026-06-05')
    expect(o).toEqual({ analys: 'Hö, Labb, 2026-06-05', grovfoderKgPerDag: 9, produkter: [], kostnadPerManad: 0 })
  })
  it('uppföljning förfallen 28 dagar efter senaste mätning', () => {
    const t = beraknaTrend([post('2026-09-01', 500)], '2026-09-29')
    expect(t.uppfoljningForfallen).toBe(true)
  })
  it('ordningen i listan spelar ingen roll', () => {
    const t = beraknaTrend([post('2026-10-01', 480), post('2026-09-01', 500)], '2026-10-02')
    expect(t.vikt).toMatchObject({ forsta: 500, senaste: 480 })
  })
})
