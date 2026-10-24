import { useTranslation } from 'react-i18next'
import { useSession } from '../routes/session'

/**
 * Says that the signed-in user's last log out failed, so the session is still signed in, with a retry (#169). Shown
 * where a log out leaves a user: the landing page and the new-terms screen.
 */
export function LogOutFailed({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const session = useSession()
  if (!session.logOutFailed) return null
  return (
    <div className={`ruta fel ${className}`.trim()} role="alert">
      {t('account.logOutFailed.text')}{' '}
      <button className="lank" onClick={() => void session.logOut()}>
        {t('account.logOutFailed.retry')}
      </button>
    </div>
  )
}
