// The AI routes on the API (#30): /api/v1/ai/profile and /journal (a plan's explanation is in plans.ts since #32), signed-in only, requests and answers
// in the shared contracts (@fodr/contracts/ai). The AI only reads and explains; the plan is the domain's (CLAUDE.md).
import { useQueryClient } from '@tanstack/react-query'
import {
  JournalResponseSchema,
  ProfileResponseSchema,
  type JournalRequest,
  type JournalResponse,
  type ProfileRequest,
  type ProfileResponse,
} from '@fodr/contracts/ai'
import { ApiError, callApi, sessionGuard } from './api-v1'
import i18n from './i18n'

const ask = async (path: string, body: unknown): Promise<unknown> =>
  (await callApi(`/ai/${path}`, { method: 'POST', body: JSON.stringify(body) })).json()

export const aiApi = {
  interpretProfile: async (body: ProfileRequest): Promise<ProfileResponse> =>
    ProfileResponseSchema.parse(await ask('profile', body)),
  analyzeJournal: async (body: JournalRequest): Promise<JournalResponse> =>
    JournalResponseSchema.parse(await ask('journal', body)),
}

/** The AI calls, each reading the session again when it has ended (401), so the workspace sends to /login. */
export function useAi(): typeof aiApi {
  const guard = sessionGuard(useQueryClient())
  return {
    interpretProfile: (body) => guard(aiApi.interpretProfile(body)),
    analyzeJournal: (body) => guard(aiApi.analyzeJournal(body)),
  }
}

/** The text for a failed AI call, from the API's problem code (ADR 0013, ADR 0014). */
export function aiErrorText(e: unknown): string {
  switch (e instanceof ApiError ? e.code : undefined) {
    case 'ai.not_configured':
      return i18n.t('ai.errors.notConfigured')
    case 'ai.rate_limited':
      return i18n.t('ai.errors.rateLimited')
    case 'ai.quota_exceeded':
      return i18n.t('ai.errors.quotaExceeded')
    case 'ai.unavailable':
      return i18n.t('ai.errors.unavailable')
    case 'ai.refused':
      return i18n.t('ai.errors.refused')
    case 'ai.truncated':
      return i18n.t('ai.errors.truncated')
    case 'validation.invalid':
    case 'request.too_large':
      return i18n.t('ai.errors.invalid')
    default:
      return i18n.t('ai.errors.failed')
  }
}
