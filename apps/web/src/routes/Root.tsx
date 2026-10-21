// The root route: holds the session (still the browser mock in auth.ts) and provides it to every route.
import { useState } from 'react'
import { Outlet } from 'react-router'
import { currentUser, type User } from '../auth'
import { SessionContext, type Session } from './session'

export function Root() {
  const [user, setUser] = useState<User | null>(currentUser)
  const session: Session = { user, setUser }
  return (
    <SessionContext value={session}>
      <Outlet />
    </SessionContext>
  )
}
