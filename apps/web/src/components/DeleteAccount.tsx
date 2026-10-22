// Deleting the account (#41, CF8): a dialog that says what goes, offers the export first (#40) and takes the password,
// which the server requires. The account and everything of it are removed at once; the user lands on the start page,
// which says so, and a receipt is emailed.
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AuthError, authClient } from '../auth-client'
import { useSession } from '../routes/session'

export function DeleteAccount() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useSession()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'wrongPassword' | 'failed' | null>(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await authClient.deleteAccount(password)
      // The start page first, so the workspace never sees the session end and sends to /login.
      void navigate('/', { replace: true, flushSync: true, state: { accountDeleted: true } })
      session.accountDeleted()
    } catch (e) {
      setBusy(false)
      // A failure that comes after the dialog was closed is not shown when it opens again.
      if (!dialog.current?.open) return
      setError(e instanceof AuthError && e.code === 'INVALID_PASSWORD' ? 'wrongPassword' : 'failed')
    }
  }

  return (
    <>
      <button className="sidofalt-lank" onClick={() => dialog.current?.showModal()}>
        {t('app.sidebar.deleteAccount')}
      </button>
      <dialog
        ref={dialog}
        className="bekrafta"
        aria-labelledby={titleId}
        onClose={() => {
          setError(null)
          setPassword('')
        }}
      >
        <h2 id={titleId}>{t('account.delete.title')}</h2>
        <p>{t('account.delete.body')}</p>
        <p>
          {t('account.delete.exportFirst')}{' '}
          <a href="/api/v1/me/export" download>
            {t('app.sidebar.export')}
          </a>
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void confirm()
          }}
        >
          <label className="falt">
            <span className="falt-label">{t('account.delete.password')}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="ruta fel" role="alert">
              {t(`account.delete.${error}`)}
            </p>
          )}
          <div className="atgardsrad">
            <button type="button" className="knapp sekundar" onClick={() => dialog.current?.close()}>
              {t('account.delete.cancel')}
            </button>
            <button type="submit" className="knapp" disabled={busy || password === ''}>
              {t('account.delete.confirm')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
