// The root route: reads the session from the API (TanStack Query, ADR 0012) and provides it to every route. Nothing
// renders until the first answer, so a signed-in user is never sent to /login on a reload.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Outlet } from 'react-router'
import { authClient, fetchMe } from '../auth-client'
import { DEMO_USER, isDemoOpen, setDemoOpen } from '../demo'
import { SessionContext, type Session } from './session'

const ME = ['me']

export function Root() {
  const queryClient = useQueryClient()
  // A failed read (the API down) counts as signed out; the user can still open the demo.
  const me = useQuery({ queryKey: ME, queryFn: fetchMe, retry: false, staleTime: Infinity })
  const [demo, setDemo] = useState(isDemoOpen)
  if (me.isPending) return null

  const leaveDemo = () => {
    setDemoOpen(false)
    setDemo(false)
  }
  const signedIn = me.data ?? null
  const session: Session = {
    // A real session wins over an open demo (a verification link clicked while trying the demo signs in to the account).
    user: signedIn ?? (demo ? DEMO_USER : null),
    refresh: async () => {
      leaveDemo()
      await queryClient.invalidateQueries({ queryKey: ME })
    },
    openDemo: () => {
      setDemoOpen(true)
      setDemo(true)
    },
    logOut: async () => {
      leaveDemo()
      if (!signedIn) return
      try {
        await authClient.signOut()
        queryClient.setQueryData(ME, null)
      } catch {
        // Sign-out failed (offline, server error): read the session again rather than pretend it ended.
        await queryClient.invalidateQueries({ queryKey: ME })
      }
    },
  }
  return (
    <SessionContext value={session}>
      <Outlet />
    </SessionContext>
  )
}
