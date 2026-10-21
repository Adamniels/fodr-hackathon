// /reset-password: where the mailed link for a new password lands (#23). The API checked the link and sends either a
// token or ?error=INVALID_TOKEN; the new password goes to the API with the token.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { Wordmark } from '../components/Brand'
import { AuthError, authClient } from '../auth-client'
import { authErrorText } from '../i18n/auth'

export function ResetPassword() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await authClient.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(authErrorText(err instanceof AuthError ? err.code : 'UNKNOWN'))
    } finally {
      setBusy(false)
    }
  }

  const requestNew = (
    <Link to="/login" state={{ mode: 'forgot' }}>
      {t('resetPassword.requestNew')}
    </Link>
  )

  return (
    <main className="kort login">
      <Wordmark />
      <h1>{t('resetPassword.title')}</h1>
      {!token || params.has('error') ? (
        <>
          <p className="ruta fel">{t('resetPassword.invalid')}</p>
          <p>{requestNew}</p>
        </>
      ) : done ? (
        <>
          <p className="ruta">{t('resetPassword.done')}</p>
          <p>
            <Link to="/login">{t('resetPassword.toLogIn')}</Link>
          </p>
        </>
      ) : (
        <form onSubmit={(e) => void save(e)}>
          <label className="falt">
            <span className="falt-label">{t('resetPassword.newPassword')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <span className="liten">{t('login.passwordHint')}</span>
          </label>
          {error && (
            <div className="ruta fel" role="alert">
              {error} {requestNew}
            </div>
          )}
          <button className="knapp bred" type="submit" disabled={busy}>
            {t('resetPassword.submit')}
          </button>
        </form>
      )}
    </main>
  )
}
