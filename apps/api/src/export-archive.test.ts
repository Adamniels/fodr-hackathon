import { describe, expect, it } from 'vitest'
import { extensionOf, folderOf } from './export-archive'

// The names inside a user's export (#40).
describe('folderOf', () => {
  const id = '1234abcd-0000-4000-8000-000000000000'
  it('names a horse in plain letters, with the start of its ID', () => {
    expect(folderOf('Sixten', id)).toBe('horses/sixten-1234abcd')
    expect(folderOf('Åsa Öhman', id)).toBe('horses/asa-ohman-1234abcd')
    expect(folderOf('Bjørn', id)).toBe('horses/bj-rn-1234abcd')
  })
  it('falls back to "horse" for a name without letters', () => {
    expect(folderOf('🐴', id)).toBe('horses/horse-1234abcd')
    expect(folderOf('', id)).toBe('horses/horse-1234abcd')
  })
})

describe('extensionOf', () => {
  it('gives each report type its extension, and bin for an unknown one', () => {
    expect(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'].map(extensionOf)).toEqual([
      'pdf',
      'png',
      'jpg',
      'webp',
      'bin',
    ])
  })
})
