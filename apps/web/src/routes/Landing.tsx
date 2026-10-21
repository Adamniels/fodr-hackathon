// The public landing page at /, and at /login with the login dialog open. After logging in or opening the demo the
// app opens at the page a logged-out visitor asked for (WorkspaceGate), or at /horses.
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { DEMO_ACCOUNT, logIn, type User } from '../auth'
import { LandingPage } from '../components/LandingPage'
import { Login } from '../components/Login'
import { produkter } from '../products'
import { useSession } from './session'

export function Landing({ login = false }: { login?: boolean }) {
  const { t } = useTranslation()
  const { user, setUser } = useSession()
  const navigate = useNavigate()
  // `from`: the page a logged-out visitor asked for (WorkspaceGate); `fromLanding`: the dialog was opened here.
  const state = useLocation().state as { from?: string; fromLanding?: boolean } | null
  const from = state?.from

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  const open = (a: User) => {
    setUser(a)
    void navigate(from ?? '/horses', { replace: login })
  }
  // Back to the landing page it was opened from, so history keeps one entry for it; else (a redirect) to /.
  const close = () => void (state?.fromLanding ? navigate(-1) : navigate('/', { replace: true }))

  return (
    <>
      <LandingPage
        produkter={produkter}
        loggedInAs={user?.namn ?? null}
        onDemo={() => open(user ?? logIn(DEMO_ACCOUNT.epost))}
        onLogIn={() => void navigate('/login', { state: { fromLanding: true } })}
      />
      {login && (
        <div className="dialog-bakgrund" onClick={close}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('login.dialogLabel')}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="dialog-stang" aria-label={t('common.close')} onClick={close}>
              ×
            </button>
            <Login onLoggedIn={open} />
          </div>
        </div>
      )}
    </>
  )
}
