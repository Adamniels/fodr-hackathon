// The public landing page at /, and at /login with the account dialog open. A signed-in visitor to /login goes on to
// the page a logged-out visitor asked for (WorkspaceGate), or /horses; the mailed links land there signed in.
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { LandingPage } from '../components/LandingPage'
import { Login, type LoginMode } from '../components/Login'
import { produkter } from '../products'
import { useSession } from './session'

export function Landing({ login = false }: { login?: boolean }) {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // `from`: the page a logged-out visitor asked for; `fromLanding`: the dialog was opened here; `mode`: which form.
  const state = useLocation().state as { from?: string; fromLanding?: boolean; mode?: LoginMode } | null
  const target = state?.from ?? '/horses'

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  if (login && session.user) return <Navigate to={target} replace />

  const openDemo = () => {
    if (!session.user) session.openDemo()
    void navigate(target, { replace: login })
  }
  // Back to the landing page it was opened from, so history keeps one entry for it; else (a redirect) to /.
  const close = () => void (state?.fromLanding ? navigate(-1) : navigate('/', { replace: true }))

  return (
    <>
      <LandingPage
        produkter={produkter}
        loggedInAs={session.user?.name ?? null}
        onDemo={openDemo}
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
              onDemo={openDemo}
              initialMode={state?.mode}
              linkFailed={params.has('error')}
            />
          </div>
        </div>
      )}
    </>
  )
}
