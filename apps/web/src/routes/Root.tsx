// The root route: reads the session from the API (TanStack Query, ADR 0012) and provides it to every route. Nothing
// renders until the first answer, so a signed-in user is never sent to /login on a reload.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet } from 'react-router'
import { authClient, fetchMe, ME_QUERY_KEY as ME } from '../auth-client'
import { ANALYSES_QUERY_KEY } from '../analyses'
import { HORSES_QUERY_KEY } from '../horses'
import { JOURNAL_QUERY_KEY } from '../journal'
import { PLANS_QUERY_KEY } from '../plans'
import { ADMIN_QUERY_KEY } from '../admin'
import { SessionContext, type Session } from './session'

export function Root() {
  const queryClient = useQueryClient()
  // A failed read (the API down) counts as signed out.
  const me = useQuery({ queryKey: ME, queryFn: fetchMe, retry: false, staleTime: Infinity })
  if (me.isPending) return null

  const signedIn = me.data ?? null
  // Nothing of the account stays in memory for whoever uses the browser next.
  const forget = () => {
    queryClient.removeQueries({ queryKey: HORSES_QUERY_KEY })
    queryClient.removeQueries({ queryKey: ANALYSES_QUERY_KEY })
    queryClient.removeQueries({ queryKey: PLANS_QUERY_KEY })
    queryClient.removeQueries({ queryKey: JOURNAL_QUERY_KEY })
    queryClient.removeQueries({ queryKey: ADMIN_QUERY_KEY })
    queryClient.setQueryData(ME, null)
  }
  const session: Session = {
    user: signedIn,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ME })
    },
    logOut: async () => {
      if (!signedIn) return
      try {
        await authClient.signOut()
        forget()
      } catch {
        // Sign-out failed (offline, server error): read the session again rather than pretend it ended.
        await queryClient.invalidateQueries({ queryKey: ME })
      }
    },
    accountDeleted: forget,
  }
  return (
    <SessionContext value={session}>
      <Outlet />
    </SessionContext>
  )
}
