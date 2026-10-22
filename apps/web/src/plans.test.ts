import { describe, expect, it } from 'vitest'
import type { SavedPlan } from '@fodr/contracts/plans'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { newHorseProfile } from './horses'
import { isSavedFor } from './plans'

const hast: Hastprofil = { ...newHorseProfile(), id: '00000000-0000-4000-8000-000000000001', namn: 'Sixten' }
const analys: Grovfoderanalys = { typ: 'ho', tsProcent: 85, perKgTs: { energi: 9 } }
const saved = {
  inputs: { profil: hast, analys },
  productSetVersion: 'v1',
} as SavedPlan

describe('isSavedFor (#27)', () => {
  it('is the saved plan for the same profile, analysis and catalogue, whatever order the fields come in', () => {
    const reordered = Object.fromEntries(Object.entries(hast).reverse()) as unknown as Hastprofil
    expect(isSavedFor(saved, reordered, analys, 'v1')).toBe(true)
  })

  it('leaves out a field set to undefined, as the server never sends one', () => {
    expect(isSavedFor(saved, { ...hast, ras: undefined }, analys, 'v1')).toBe(true)
  })

  it('is not, once a value changed', () => {
    expect(isSavedFor(saved, { ...hast, viktKg: 540 }, analys, 'v1')).toBe(false)
    expect(isSavedFor(saved, hast, { ...analys, tsProcent: 84 }, 'v1')).toBe(false)
  })

  it('is not with another catalogue, or without a saved plan', () => {
    expect(isSavedFor(saved, hast, analys, 'v2')).toBe(false)
    expect(isSavedFor(null, hast, analys, 'v1')).toBe(false)
  })
})
