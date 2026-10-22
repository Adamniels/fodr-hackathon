// The session, provided by Root to every route: the signed-in user from the API (GET /api/v1/me, #23). A React context rather than the outlet context, which the workspace uses for
// its steps, so the two can never be read in place of each other.
import { createContext, useContext } from 'react'
import type { User } from '@fodr/contracts/me'

export interface Session {
  user: User | null
  /** Reads the session again after a login. */
  refresh: () => Promise<void>
  logOut: () => Promise<void>
  /** Forgets the account after it was deleted (#41): the server has ended the session already. */
  accountDeleted: () => void
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession is used outside the Root route')
  return session
}
