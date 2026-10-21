// The session (still the browser mock in auth.ts), provided by Root to every route. A React context rather than the
// outlet context, which the workspace uses for its steps, so the two can never be read in place of each other.
import { createContext, useContext } from 'react'
import type { User } from '../auth'

export interface Session {
  user: User | null
  setUser: (user: User | null) => void
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession is used outside the Root route')
  return session
}
