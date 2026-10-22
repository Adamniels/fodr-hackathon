import { useTranslation } from 'react-i18next'
import type { AnalysisSaveState } from '../analyses'

/**
 * Where the edits are: saving, saved, failed with a retry, refused by the server, or held back while a value is
 * invalid. The status is read out when it changes; nothing shows for a record not edited since the page opened.
 */
export function SaveStatus({ state, onRetry }: { state: AnalysisSaveState | undefined; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="sparstatus">
      <span role="status">{state && t(`app.save.${state}`)}</span>
      {state === 'failed' && (
        <button className="knapp text kompakt" onClick={onRetry}>
          {t('app.save.retry')}
        </button>
      )}
    </div>
  )
}
