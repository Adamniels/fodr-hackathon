// The demo account, in the browser only (owner, #23): no backend account, its horses and journal in localStorage as
// before the real accounts. The demo button opens it; #29 removes it together with the example data.
import type { User } from '@fodr/contracts/me'

// The ID keys the demo's stored horses and journal (storage.ts), so it keeps the mock's value.
export const DEMO_USER: User = { id: 'demo', name: 'Anna Demo', email: 'demo@fodr.se', emailVerified: true }

const DEMO_KEY = 'fodr.demo.v1'

export function isDemoOpen(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function setDemoOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(DEMO_KEY, '1')
    else localStorage.removeItem(DEMO_KEY)
  } catch {
    // Storage blocked: the demo lasts until the page reloads.
  }
}
