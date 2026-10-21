import { describe, expect, it } from 'vitest'
import { resolveClientIp } from './client-ip'

describe('resolveClientIp', () => {
  it('uses the trusted header, its last entry when it is a list (the one the proxy added)', () => {
    expect(resolveClientIp('203.0.113.9', '10.0.0.1')).toBe('203.0.113.9')
    expect(resolveClientIp('198.51.100.1, 203.0.113.9', '10.0.0.1')).toBe('203.0.113.9')
  })

  it('strips a port, which some proxies append', () => {
    expect(resolveClientIp('203.0.113.9:51234', undefined)).toBe('203.0.113.9')
    expect(resolveClientIp('[2001:db8::1]:51234', undefined)).toBe('2001:db8::1')
  })

  it('accepts IPv6', () => {
    expect(resolveClientIp('2001:db8::1', undefined)).toBe('2001:db8::1')
  })

  it('falls back to the connection when the header is missing or not an IP', () => {
    expect(resolveClientIp(undefined, '10.0.0.1')).toBe('10.0.0.1')
    expect(resolveClientIp('unknown', '10.0.0.1')).toBe('10.0.0.1')
    expect(resolveClientIp('', '10.0.0.1')).toBe('10.0.0.1')
  })

  it('is undefined with neither', () => {
    expect(resolveClientIp('garbage', undefined)).toBeUndefined()
    expect(resolveClientIp(undefined, undefined)).toBeUndefined()
  })
})
