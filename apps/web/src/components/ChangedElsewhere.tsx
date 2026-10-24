import { useTranslation } from 'react-i18next'
import type { Change } from '../conflict-fields'

/**
 * Shown when a save was refused because the server's copy changed on another device since the page read it (#140):
 * what differs, the saved value and the page's, and the user's choice. Nothing is saved until they choose; taking the
 * saved copy gives up the page's edit, keeping theirs saves it over the saved one. `onKeepMine` is left out when the
 * page's copy can no longer be saved over (the saved one is another record).
 */
export function ChangedElsewhere({
  title,
  changes,
  onTakeTheirs,
  onKeepMine,
}: {
  title: string
  changes: Change[]
  onTakeTheirs: () => void
  onKeepMine?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="ruta varn" role="alert">
      <p>
        <strong>{title}</strong> {t('conflict.intro')}
      </p>
      <ul>
        {changes.map((c) => (
          <li key={c.field}>{t('conflict.change', { field: c.field, theirs: c.theirs, mine: c.mine })}</li>
        ))}
      </ul>
      <div className="atgardsrad">
        <button className="knapp" onClick={onTakeTheirs}>
          {t('conflict.takeTheirs')}
        </button>
        {onKeepMine && (
          <button className="knapp sekundar" onClick={onKeepMine}>
            {t('conflict.keepMine')}
          </button>
        )}
      </div>
    </div>
  )
}
