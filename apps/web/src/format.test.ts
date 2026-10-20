import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, parseDecimal, parseIsoDate, tal } from './format'
import i18n from './i18n'

describe('parseDecimal', () => {
  it('accepts a decimal point', () => {
    expect(parseDecimal('39.7')).toBe(39.7)
  })

  it('accepts a decimal comma', () => {
    expect(parseDecimal('39,7')).toBe(39.7)
  })

  it('accepts integers, negatives and surrounding spaces', () => {
    expect(parseDecimal('39')).toBe(39)
    expect(parseDecimal('-5')).toBe(-5)
    expect(parseDecimal(' 12,5 ')).toBe(12.5)
  })

  it('reads an unfinished decimal as the number typed so far', () => {
    expect(parseDecimal('39.')).toBe(39)
    expect(parseDecimal('39,')).toBe(39)
  })

  it('returns undefined for empty input, never 0', () => {
    expect(parseDecimal('')).toBeUndefined()
    expect(parseDecimal('   ')).toBeUndefined()
  })

  it('returns undefined for text that is not a number', () => {
    expect(parseDecimal('abc')).toBeUndefined()
    expect(parseDecimal('1,2,3')).toBeUndefined()
    expect(parseDecimal('3 9')).toBeUndefined()
    expect(parseDecimal('.')).toBeUndefined()
    expect(parseDecimal('-')).toBeUndefined()
    expect(parseDecimal('1e3')).toBeUndefined()
    expect(parseDecimal('Infinity')).toBeUndefined()
  })

  it('returns undefined for digits too long to be a finite number', () => {
    expect(parseDecimal('9'.repeat(400))).toBeUndefined()
  })
})

describe('tal', () => {
  it('formats for sv-SE: a decimal comma and a no-break space between thousands', () => {
    expect(tal(545.5, 1)).toBe('545,5')
    expect(tal(1000, 0)).toBe('1\u00a0000')
  })

  it('drops trailing zeros up to the given decimals', () => {
    expect(tal(545, 1)).toBe('545')
    expect(tal(12.06, 1)).toBe('12,1')
  })

  it('shows a missing value as a dash, never 0', () => {
    expect(tal(undefined, 1)).toBe('–')
    expect(tal(Number.NaN, 0)).toBe('–')
  })
})

describe('parseIsoDate', () => {
  it('reads YYYY-MM-DD as local midnight of that calendar day', () => {
    const d = parseIsoDate('2026-06-05')
    expect([d?.getFullYear(), d?.getMonth(), d?.getDate(), d?.getHours()]).toEqual([2026, 5, 5, 0])
  })

  it('returns undefined for text that is not a valid calendar date, never a fallback date', () => {
    for (const text of ['', '2026-02-30', '2026-13-01', '2026-6-5', '28 sept', '2026-06-05T10:00', ' 2026-06-05']) {
      expect(parseIsoDate(text)).toBeUndefined()
    }
  })
})

describe('formatDate', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await i18n.changeLanguage('sv-SE')
  })

  it('formats for sv-SE in the short numeric style', () => {
    expect(formatDate('2026-06-05')).toBe('2026-06-05')
  })

  it('follows the active locale', async () => {
    await i18n.changeLanguage('en-GB')
    expect(formatDate('2026-06-05')).toBe('05/06/2026')
  })

  it('shows the stored calendar day in a time zone behind UTC', () => {
    vi.stubEnv('TZ', 'America/New_York')
    expect(formatDate('2026-06-05')).toBe('2026-06-05')
    expect(formatDate('2026-01-01')).toBe('2026-01-01')
  })

  it('returns text that is not a valid date as it is', () => {
    expect(formatDate('28 sept')).toBe('28 sept')
    expect(formatDate('2026-02-30')).toBe('2026-02-30')
  })
})
