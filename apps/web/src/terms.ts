// Accepting the current beta terms (#42): POST /api/v1/me/terms, after which the session holds the new version.
import { useQueryClient } from '@tanstack/react-query'
import { MeResponseSchema } from '@fodr/contracts/me'
import { TERMS_VERSION } from '@fodr/contracts/terms'
import { callApi, sessionGuard } from './api-v1'
import { ME_QUERY_KEY } from './auth-client'

export function useAcceptTerms() {
  const queryClient = useQueryClient()
  const guard = sessionGuard(queryClient)
  return async () => {
    const res = await guard(callApi('/me/terms', { method: 'POST', body: JSON.stringify({ version: TERMS_VERSION }) }))
    const { user } = MeResponseSchema.parse(await res.json())
    // The answer is the session's user with the new version: no second read of /me.
    queryClient.setQueryData(ME_QUERY_KEY, user)
  }
}
