import { describe, expect, it } from 'vitest'
import { RASER, hittaRas } from './breeds'

describe('RASER', () => {
  it('a breed is data: id, type and weight range, with its name in the web catalogue (ADR 0014)', () => {
    for (const r of RASER) expect(Object.keys(r).filter((k) => !['id', 'typ', 'viktKg'].includes(k))).toEqual([])
  })
  it('hittaRas finds a breed by id', () => {
    expect(hittaRas('islandshast')).toEqual({ id: 'islandshast', typ: 'lattfodd', viktKg: { min: 280, max: 400 } })
    expect(hittaRas('okand')).toBeUndefined()
  })
})
