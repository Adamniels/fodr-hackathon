import { useState } from 'react'
import { parseDecimal } from '../format'

const show = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? String(value) : '')

/**
 * A number field that keeps what the user types. A controlled type="number" input loses unfinished text such as
 * "39." (the browser reports it as empty), so this field holds its own draft and reports only parsed numbers.
 * Empty or invalid drafts are not reported: the last valid value stays, and the field never turns into 0.
 * Text with inputMode="decimal" accepts both comma and point in every browser and still opens a numeric keypad.
 */
export function DecimalInput({
  value,
  onChange,
  className,
}: {
  value: number | undefined
  onChange: (value: number) => void
  className?: string
}) {
  const [draft, setDraft] = useState(() => show(value))
  // The last value this field reported or received. Only a change from outside (an example or an uploaded report)
  // replaces the draft, so the draft is never reset while the user is typing.
  const [synced, setSynced] = useState(value)
  if (!Object.is(value, synced)) {
    setSynced(value)
    setDraft(show(value))
  }

  return (
    <input
      className={className}
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        const parsed = parseDecimal(e.target.value)
        if (parsed !== undefined) {
          setSynced(parsed)
          onChange(parsed)
        }
      }}
    />
  )
}
