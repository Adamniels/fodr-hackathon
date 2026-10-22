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

/** The tokens a call used, as the provider reports them; its cost is estimated from them (#31). */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/** A call's answer and the tokens it used. */
export interface AiReply<T> {
  value: T
  usage: TokenUsage
}

export interface AiProvider {
  readAnalysis(file: AnalysisFile): Promise<AiReply<AnalysisResponse>>
  interpretProfile(input: ProfileRequest): Promise<AiReply<ProfileResponse>>
  explainPlan(payload: ExplanationRequest): Promise<AiReply<string>>
  analyzeJournal(payload: JournalRequest): Promise<AiReply<JournalResponse>>
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
  /** The tokens a failed call still used (a refused or cut-off reply), when the provider reported them. */
  readonly usage: TokenUsage | undefined

  constructor(kind: AiErrorKind, status?: number, usage?: TokenUsage) {
    super(status === undefined ? kind : `${kind} ${status}`)
    this.name = 'AiProviderError'
    this.kind = kind
    this.status = status
    this.usage = usage
  }
}
