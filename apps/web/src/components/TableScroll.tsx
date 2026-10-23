import type { ReactNode } from 'react'

/**
 * A table that scrolls sideways in a box of its own when the screen is narrower than it (#44, WCAG 1.4.10 and 2.1.1).
 * The box is a named region that takes keyboard focus, so arrow keys scroll it, and the table inside stays a table for
 * screen readers (a table made to scroll itself with display: block loses that in some browsers).
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tabell-rulla" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
