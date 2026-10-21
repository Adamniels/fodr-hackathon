import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  breedName,
  nutrientLabel,
  shortNutrientLabel,
  formatDate,
  localIsoDate,
  parseDecimal,
  parseIsoDate,
  formatNumber,
} from './format'
import { RASER } from '@fodr/domain/breeds'
import { NUTRIENT_KEYS } from '@fodr/domain/nutrients'
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

describe('formatNumber', () => {
  it('formats for sv-SE: a decimal comma and a no-break space between thousands', () => {
    expect(formatNumber(545.5, 1)).toBe('545,5')
    expect(formatNumber(1000, 0)).toBe('1\u00a0000')
  })

  it('drops trailing zeros up to the given decimals', () => {
    expect(formatNumber(545, 1)).toBe('545')
    expect(formatNumber(12.06, 1)).toBe('12,1')
  })

  it('shows a missing value as a dash, never 0', () => {
    expect(formatNumber(undefined, 1)).toBe('–')
    expect(formatNumber(Number.NaN, 0)).toBe('–')
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
    // The stub only reaches Intl in a forked worker; under the threads pool it is ignored and this test proves nothing.
    expect(new Date(Date.UTC(2026, 5, 5)).getDate()).toBe(4)
    expect(formatDate('2026-06-05')).toBe('2026-06-05')
    expect(formatDate('2026-01-01')).toBe('2026-01-01')
  })

  it('returns text that is not a valid date as it is', () => {
    expect(formatDate('28 sept')).toBe('28 sept')
    expect(formatDate('2026-02-30')).toBe('2026-02-30')
  })
})

describe('localIsoDate', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  // C6: at 00:30 in Stockholm it is still the previous day in UTC.
  it('gives the local calendar day just after midnight, summer and winter time', () => {
    vi.stubEnv('TZ', 'Europe/Stockholm')
    // The stub only reaches Date in a forked worker; under the threads pool it is ignored and this test proves nothing.
    expect(new Date(Date.UTC(2026, 9, 14, 22, 30)).getDate()).toBe(15)
    expect(localIsoDate(new Date(Date.UTC(2026, 9, 14, 22, 30)))).toBe('2026-10-15')
    expect(localIsoDate(new Date(Date.UTC(2026, 11, 14, 23, 30)))).toBe('2026-12-15')
  })

  it('defaults to now', () => {
    vi.stubEnv('TZ', 'Europe/Stockholm')
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 14, 22, 30) })
    expect(localIsoDate()).toBe('2026-10-15')
  })

  it('reads back through parseIsoDate as the same day', () => {
    // Checked first: localIsoDate(undefined) would give today and pass for the wrong reason.
    const dag = parseIsoDate('2026-02-28')
    expect(dag).toBeInstanceOf(Date)
    expect(localIsoDate(dag)).toBe('2026-02-28')
  })
})

describe('addDays', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('counts calendar days across the change to winter time', () => {
    vi.stubEnv('TZ', 'Europe/Stockholm')
    expect(new Date(Date.UTC(2026, 9, 14, 22, 30)).getDate()).toBe(15)
    // 25 October 2026 has 25 hours in Stockholm.
    const fore = parseIsoDate('2026-10-24')!
    expect(localIsoDate(addDays(fore, 1))).toBe('2026-10-25')
    expect(localIsoDate(addDays(fore, 2))).toBe('2026-10-26')
    expect(addDays(fore, 2).getHours()).toBe(0)
    expect(localIsoDate(addDays(fore, -24))).toBe('2026-09-30')
  })
})

describe('breedName', () => {
  // The names breeds.ts held before #95. The journal AI receives them as `ras`, so they must not change.
  it('names every breed exactly as before', () => {
    expect(Object.fromEntries(RASER.map((r) => [r.id, breedName(r.id)]))).toEqual({
      shetland: 'Shetlandsponny',
      russ: 'Gotlandsruss',
      ponny: 'Ponny, övrig (t.ex. welsh, connemara)',
      islandshast: 'Islandshäst',
      fjordhast: 'Fjordhäst',
      nordsvensk: 'Nordsvensk brukshäst / kallblodstravare',
      ardenner: 'Ardenner',
      varmblod_rid: 'Varmblodig ridhäst / halvblod',
      varmblod_trav: 'Varmblodig travhäst',
      arab: 'Arabiskt fullblod',
      fullblod: 'Engelskt fullblod',
    })
  })
})

describe('nutrientLabel', () => {
  // The labels nutrients.ts held before #95. The plan explanation sends them to the model, so they must not change.
  it('names every nutrient exactly as before', () => {
    expect(Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, nutrientLabel(k)]))).toEqual({
      energi: 'Energi',
      smbRp: 'Smältbart råprotein',
      ca: 'Kalcium (Ca)',
      p: 'Fosfor (P)',
      mg: 'Magnesium (Mg)',
      na: 'Natrium (Na)',
      fe: 'Järn (Fe)',
      mn: 'Mangan (Mn)',
      cu: 'Koppar (Cu)',
      zn: 'Zink (Zn)',
      co: 'Kobolt (Co)',
      jod: 'Jod (I)',
      se: 'Selen (Se)',
      vitA: 'Vitamin A',
      vitD: 'Vitamin D',
      vitE: 'Vitamin E',
      b1: 'Vitamin B1',
      b2: 'Vitamin B2',
      biotin: 'Biotin',
      socker: 'Socker',
      starkelse: 'Stärkelse',
    })
  })
  it('the short label inside a sentence drops the symbol and lowercases the first letter of a word', () => {
    expect([shortNutrientLabel('ca'), shortNutrientLabel('vitE'), shortNutrientLabel('smbRp')]).toEqual([
      'kalcium',
      'vitamin E',
      'smältbart råprotein',
    ])
  })
})
