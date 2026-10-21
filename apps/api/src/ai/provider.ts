// The AI behind an interface (#20): the routes call an AiProvider, main.ts gives them the Anthropic one
// (anthropic.ts), and tests a fake. Request and response shapes are the ones the web app sends and reads; they move
// to packages/contracts with request validation in #30, which also ends this file importing its response types from
// the Anthropic implementation.
import type { AnalysisResponse, JournalResponse, ProfileResponse } from './anthropic'

export interface AnalysisFile {
  mediaType: string
  base64: string
}

export interface ProfileInput {
  foderText: string
  halsaText: string
  tidigareSvar: { fraga: string; svar: string }[]
  produkter: { id: string; namn: string }[]
}

export interface AiProvider {
  readAnalysis(file: AnalysisFile): Promise<AnalysisResponse>
  interpretProfile(input: ProfileInput): Promise<ProfileResponse>
  explainPlan(payload: unknown): Promise<string>
  analyzeJournal(payload: unknown): Promise<JournalResponse>
}

/**
 * Why a provider call failed, independent of the provider: no key configured, the key was rejected, rate limited,
 * any other error from the provider (with its HTTP status, when it has one), the model refused, or the reply was cut
 * off at the token limit.
 */
export type AiErrorKind = 'missing_key' | 'auth' | 'rate_limit' | 'upstream' | 'refusal' | 'truncated'

export class AiProviderError extends Error {
  readonly kind: AiErrorKind
  readonly status: number | undefined

  constructor(kind: AiErrorKind, status?: number) {
    super(status === undefined ? kind : `${kind} ${status}`)
    this.name = 'AiProviderError'
    this.kind = kind
    this.status = status
  }
}
