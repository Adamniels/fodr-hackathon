import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseDecimal } from '../format'

const show = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? String(value) : '')

/**
 * A number field that keeps what the user types. A controlled type="number" input loses unfinished text such as
 * "39." (the browser reports it as empty), so this field holds its own draft and reports only parsed numbers.
 * Text with inputMode="decimal" accepts both comma and point in every browser and still opens a numeric keypad.
 * The iOS decimal keypad has no minus key, so a field where negative values are expected asks for the full keyboard.
 *
 * Every parsed number is reported, in range or not: the caller validates the stored value and passes its message as
 * `error` (#13). A draft that cannot be used is not reported and shows its own message: empty ("required") or not a
 * number. Leaving the field then brings back the stored value, so the field never shows what the plan does not use
 * and never turns into 0. With `onClear`, an empty draft means the value is missing (an analysis value not given).
 */
export function DecimalInput({
  value,
  onChange,
  onClear,
  error,
  className,
  placeholder,
  needsMinusKey = false,
}: {
  value: number | undefined
  onChange: (value: number) => void
  onClear?: () => void
  error?: string
  className?: string
  placeholder?: string
  needsMinusKey?: boolean
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => show(value))
  // The last value this field reported or received. Only a change from outside (an example or an uploaded report)
  // replaces the draft, so the draft is never reset while the user is typing.
  const [synced, setSynced] = useState(value)
  if (!Object.is(value, synced)) {
    setSynced(value)
    setDraft(show(value))
  }

  const empty = draft.trim() === ''
  const draftError =
    empty && onClear
      ? undefined
      : empty
        ? t('form.required')
        : parseDecimal(draft) === undefined
          ? t('form.notANumber')
          : undefined
  const message = draftError ?? error

  return (
    <>
      <input
        className={className}
        inputMode={needsMinusKey ? 'text' : 'decimal'}
        value={draft}
        placeholder={placeholder}
        aria-invalid={message ? true : undefined}
        onChange={(e) => {
          setDraft(e.target.value)
          if (onClear && e.target.value.trim() === '') {
            setSynced(undefined)
            onClear()
            return
          }
          const parsed = parseDecimal(e.target.value)
          if (parsed !== undefined) {
            setSynced(parsed)
            onChange(parsed)
          }
        }}
        onBlur={() => {
          if (draftError) setDraft(show(value))
        }}
      />
      {message && <span className="falt-fel">{message}</span>}
    </>
  )
}
