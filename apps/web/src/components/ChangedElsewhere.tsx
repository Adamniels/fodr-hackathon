import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Change } from '../conflict-fields'

/**
 * Shown when a save was refused because the server's copy changed on another device since the page read it (#140):
 * what differs, the saved value and the page's, and the user's choice. Nothing is saved until they choose; taking the
 * saved copy gives up the page's edit, keeping theirs saves it over the saved one. `onKeepMine` is left out when the
 * page's copy cannot be saved over the saved one (another record, or a value that is not valid).
 *
 * A region named by its title. Only the title and its first sentence are the alert: the list changes as the user types
 * on, and is not read out again on every keystroke. The buttons go with the choice, so `onChosen` moves focus on.
 */
export function ChangedElsewhere({
  title,
  changes,
  onTakeTheirs,
  onKeepMine,
  onChosen,
}: {
  title: string
  changes: Change[]
  onTakeTheirs: () => void
  onKeepMine?: () => void
  onChosen: () => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const choose = (choice: () => void) => () => {
    choice()
    onChosen()
  }
  return (
    <section className="ruta varn" aria-labelledby={titleId}>
      <p role="alert">
        <strong id={titleId}>{title}</strong> {t('conflict.intro')}
      </p>
      <ul>
        {changes.map((c) => (
          <li key={c.field}>{t('conflict.change', { field: c.field, theirs: c.theirs, mine: c.mine })}</li>
        ))}
      </ul>
      <div className="atgardsrad">
        <button className="knapp" onClick={choose(onTakeTheirs)}>
          {t('conflict.takeTheirs')}
        </button>
        {onKeepMine && (
          <button className="knapp sekundar" onClick={choose(onKeepMine)}>
            {t('conflict.keepMine')}
          </button>
        )}
      </div>
    </section>
  )
}
