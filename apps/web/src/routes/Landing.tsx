// The public landing page at /, and at /login with the account dialog open. A signed-in visitor to /login goes on to
// the page a logged-out visitor asked for (WorkspaceGate), or /horses; the mailed links land there signed in.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { LandingPage } from '../components/LandingPage'
import { Login, type LoginMode } from '../components/Login'
import { useCatalogue } from '../products'
import { useSession } from './session'

export function Landing({ login = false }: { login?: boolean }) {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // `from`: the page a logged-out visitor asked for; `fromLanding`: the dialog was opened here; `mode`: which form.
  const state = useLocation().state as {
    from?: string
    fromLanding?: boolean
    mode?: LoginMode
    /** Sent here after the account was deleted (#41). */
    accountDeleted?: boolean
  } | null
  const target = state?.from ?? '/horses'
  // Said once, and focused so it is read out (#41); the history entry forgets it, so a reload does not say it again.
  const [accountDeleted] = useState(() => state?.accountDeleted === true)
  useEffect(() => {
    if (accountDeleted) void navigate('/', { replace: true, state: null })
  }, [accountDeleted, navigate])
  // The preview's catalogue from the API (#27); the page shows without it while it loads.
  const catalogue = useCatalogue()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  if (login && session.user) return <Navigate to={target} replace />

  // Signed in: to the app. Otherwise the account dialog opens on sign-up (#29; the browser demo is gone).
  const getStarted = () =>
    void (session.user
      ? navigate(target, { replace: login })
      : navigate('/login', { state: { fromLanding: true, mode: 'signUp' satisfies LoginMode } }))
  // Back to the landing page it was opened from, so history keeps one entry for it; else (a redirect) to /.
  const close = () => void (state?.fromLanding ? navigate(-1) : navigate('/', { replace: true }))

  return (
    <>
      {accountDeleted && (
        <p className="ruta ok konto-raderat" role="status" tabIndex={-1} ref={(p) => p?.focus()}>
          {t('account.delete.done')}
        </p>
      )}
      <LandingPage
        produkter={catalogue.data?.products ?? null}
        loggedInAs={session.user?.name ?? null}
        onGetStarted={getStarted}
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
            <Login
              onLoggedIn={() => void session.refresh()}
              initialMode={state?.mode}
              linkFailed={params.has('error')}
            />
          </div>
        </div>
      )}
    </>
  )
}
