import { describe, expect, it } from 'vitest'
import { parseDecimal, tal } from './format'

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
