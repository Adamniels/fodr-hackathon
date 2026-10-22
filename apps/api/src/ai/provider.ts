// The AI behind an interface (#20): the routes call an AiProvider, main.ts gives them the Anthropic one
// (anthropic.ts), and tests a fake. The requests and answers of the AI routes are the shared contracts (#30); a
// report reading is the provider's own shape, which the analysis upload converts with the domain (#26).
import type {
  ExplanationRequest,
  JournalRequest,
  JournalResponse,
  ProfileRequest,
  ProfileResponse,
} from '@fodr/contracts/ai'
import type { AnalysisResponse } from './anthropic'

export interface AnalysisFile {
  mediaType: string
  base64: string
}

export interface AiProvider {
  readAnalysis(file: AnalysisFile): Promise<AnalysisResponse>
  interpretProfile(input: ProfileRequest): Promise<ProfileResponse>
  explainPlan(payload: ExplanationRequest): Promise<string>
  analyzeJournal(payload: JournalRequest): Promise<JournalResponse>
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
