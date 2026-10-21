// The root route: holds the session (still the browser mock in auth.ts) and passes it to every route.
import { useState } from 'react'
import { Outlet } from 'react-router'
import { currentUser, type User } from '../auth'
import type { Session } from './context'

export function Root() {
  const [user, setUser] = useState<User | null>(currentUser)
  const session: Session = { user, setUser }
  return <Outlet context={session} />
}
