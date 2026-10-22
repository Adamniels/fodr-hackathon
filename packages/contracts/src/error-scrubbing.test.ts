import { describe, expect, it } from 'vitest'
import { scrubBreadcrumb, scrubEvent } from './error-scrubbing'

describe('scrubEvent', () => {
  // Everything a Sentry SDK may attach that could identify a person or hold what they wrote.
  const event = () => ({
    message: 'could not mail anna@example.se',
    exception: { values: [{ type: 'Error', value: 'no account for Anna.Berg+fodr@example.se' }] },
    request: {
      url: 'https://fodr.se/api/v1/horses/7?email=anna@example.se#top',
      method: 'POST',
      query_string: 'email=anna@example.se',
      data: { note: 'fang 2025' },
      cookies: { 'better-auth.session_token': 'secret' },
      headers: { Cookie: 'better-auth.session_token=secret', 'X-Request-Id': 'req-1', 'User-Agent': 'Firefox' },
      env: { REMOTE_ADDR: '203.0.113.7' },
    },
    user: { id: 'user-1', email: 'anna@example.se', username: 'Anna', ip_address: '203.0.113.7' },
    extra: { horse: { namn: 'Sixten' } },
    breadcrumbs: [{ category: 'console', message: 'Sixten' }],
    tags: { request_id: 'req-1' },
  })

  it('keeps only the user ID', () => {
    expect(scrubEvent(event()).user).toEqual({ id: 'user-1' })
  })

  it('keeps the request method, the URL without query or fragment, and only the request ID header', () => {
    expect(scrubEvent(event()).request).toEqual({
      url: 'https://fodr.se/api/v1/horses/7',
      method: 'POST',
      headers: { 'X-Request-Id': 'req-1' },
    })
  })

  it('drops extra data and replaces email addresses in messages and exception values', () => {
    const scrubbed = scrubEvent(event())
    expect(scrubbed.extra).toBeUndefined()
    expect(scrubbed.message).toBe('could not mail [email]')
    expect(scrubbed.exception.values[0]?.value).toBe('no account for [email]')
  })

  it('scrubs the breadcrumbs it carries and keeps the tags', () => {
    const scrubbed = scrubEvent(event())
    expect(scrubbed.breadcrumbs).toEqual([])
    expect(scrubbed.tags).toEqual({ request_id: 'req-1' })
  })

  it('leaves an event with nothing personal as it was', () => {
    const plain = { exception: { values: [{ type: 'TypeError', value: 'x is undefined' }] }, tags: { a: 'b' } }
    expect(scrubEvent(JSON.parse(JSON.stringify(plain)) as typeof plain)).toEqual(plain)
  })
})

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs, which may print anything', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'horse Sixten' })).toBeNull()
  })

  it('keeps a request breadcrumb with its URL stripped of the query and only method and status', () => {
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: { url: '/api/v1/horses?name=Sixten', method: 'GET', status_code: 500, request_body_size: 10 },
      }),
    ).toEqual({ category: 'fetch', data: { url: '/api/v1/horses', method: 'GET', status_code: 500 } })
  })

  it('keeps a navigation breadcrumb with both paths stripped of the query', () => {
    expect(
      scrubBreadcrumb({ category: 'navigation', data: { from: '/login?email=anna@example.se', to: '/horses' } }),
    ).toEqual({ category: 'navigation', data: { from: '/login', to: '/horses' } })
  })

  it('replaces email addresses in a breadcrumb message', () => {
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'button anna@example.se' })).toEqual({
      category: 'ui.click',
      message: 'button [email]',
    })
  })
})
