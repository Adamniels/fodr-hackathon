import { describe, expect, it } from 'vitest'
import { changedFields } from './changes'

describe('changedFields', () => {
  it('names nothing for two equal records', () => {
    expect(changedFields({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toEqual([])
  })

  it('names each changed value by its path, nested ones too', () => {
    expect(
      changedFields(
        { namn: 'Sixten', viktKg: 500, halsa: { fang: true, ovrigt: '' } },
        { namn: 'Sixten', viktKg: 545, halsa: { fang: false, ovrigt: '' } },
      ),
    ).toEqual(['viktKg', 'halsa.fang'])
  })

  it('names a list as one value, whatever in it changed', () => {
    expect(
      changedFields({ foder: [{ g: 1000 }], undvik: ['soja'] }, { foder: [{ g: 900 }], undvik: ['soja'] }),
    ).toEqual(['foder'])
  })

  it('compares objects in a list whatever the order of their keys, as Postgres keeps them in its own', () => {
    expect(
      changedFields(
        { foder: [{ produktId: 'x', namn: 'Pellets', gramPerDag: 1000 }] },
        { foder: [{ namn: 'Pellets', gramPerDag: 1000, produktId: 'x' }] },
      ),
    ).toEqual([])
  })

  it('names a value one side has and the other does not, never taking a missing one as 0', () => {
    expect(changedFields({ a: 0, b: { c: 1 } }, { b: undefined })).toEqual(['a', 'b.c'])
    expect(changedFields({ ras: undefined }, { ras: 'islandshast' })).toEqual(['ras'])
  })

  it('leaves out the paths it is told to', () => {
    expect(changedFields({ id: 'x', version: 1, a: 1 }, { id: 'x', version: 2, a: 1 }, ['version'])).toEqual([])
  })
})
