import { describe, expect, it } from 'vitest'
import { MeResponseSchema } from './me'
import { ProblemSchema } from './problem'

describe('MeResponseSchema', () => {
  const user = {
    id: '0b7e8c2a-4f1d-4c3a-9b2e-1a2b3c4d5e6f',
    name: 'Anna',
    email: 'anna@example.se',
    emailVerified: true,
    role: 'user' as const,
    termsVersion: '2026-10-22',
  }

  it('accepts the signed-in user', () => {
    expect(MeResponseSchema.parse({ user })).toEqual({ user })
  })

  it('drops fields outside the contract, so nothing more reaches the web app by accident', () => {
    expect(MeResponseSchema.parse({ user: { ...user, image: null, createdAt: '2026-10-21' } })).toEqual({ user })
  })

  it('rejects a user without a verified flag or with an invalid email', () => {
    expect(MeResponseSchema.safeParse({ user: { ...user, emailVerified: undefined } }).success).toBe(false)
    expect(MeResponseSchema.safeParse({ user: { ...user, email: 'anna' } }).success).toBe(false)
  })
})

describe('ProblemSchema', () => {
  it('accepts a problem with a code and a request ID', () => {
    const problem = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code: 'auth.unauthenticated',
      requestId: 'r1',
    }
    expect(ProblemSchema.parse(problem)).toEqual(problem)
  })

  it('rejects a problem without a code', () => {
    expect(ProblemSchema.safeParse({ type: 'about:blank', title: 'x', status: 500, requestId: 'r1' }).success).toBe(
      false,
    )
  })
})
