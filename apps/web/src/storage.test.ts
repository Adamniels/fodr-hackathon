import { afterEach, describe, expect, it, vi } from 'vitest'
import { nyPost, sorteradePoster } from '@fodr/domain/journal'
import { newJournalEntryId } from './storage'

describe('newJournalEntryId (#80)', () => {
  afterEach(() => vi.useRealTimers())

  // The journal orders entries on the same date by ID, so an ID made later must sort after one made earlier.
  it('keeps entries on the same date in the order they were added', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 15, 8, 0, 0) })
    const forsta = nyPost(newJournalEntryId(), '2026-10-15', { text: 'Första' })
    vi.setSystemTime(Date.UTC(2026, 9, 15, 8, 0, 1))
    const andra = nyPost(newJournalEntryId(), '2026-10-15', { text: 'Andra' })
    expect(sorteradePoster([andra, forsta]).map((p) => p.text)).toEqual(['Första', 'Andra'])
  })

  it('gives two entries made at the same moment different IDs', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 15, 8, 0, 0) })
    expect(newJournalEntryId()).not.toBe(newJournalEntryId())
  })
})
