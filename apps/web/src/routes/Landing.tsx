// The public landing page at /, and at /login with the account dialog open. A signed-in visitor to /login goes on to
// the page a logged-out visitor asked for (WorkspaceGate), or /horses; the mailed links land there signed in.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { LandingPage } from '../components/LandingPage'
import { Login, type LoginMode } from '../components/Login'
import { LogOutFailed } from '../components/LogOutFailed'
import { useCatalogue } from '../products'
import { usePageTitle } from '../page-title'
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
  usePageTitle(t(login ? 'login.dialogLabel' : 'titles.landing'))

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
        <p className="ruta ok startsida-besked" role="status" tabIndex={-1} ref={(p) => p?.focus()}>
          {t('account.delete.done')}
        </p>
      )}
      <LogOutFailed className="startsida-besked" />
      <LandingPage
        produkter={catalogue.data?.products ?? null}
        loggedInAs={session.user?.name ?? null}
        onGetStarted={getStarted}
        onLogIn={() => void navigate('/login', { state: { fromLanding: true } })}
      />
      {login && (
        <AccountDialog label={t('login.dialogLabel')} onClose={close}>
          <Login onLoggedIn={() => void session.refresh()} initialMode={state?.mode} linkFailed={params.has('error')} />
          {/* After the form, so focus starts in it; shown in the corner. */}
          <button className="dialog-stang" aria-label={t('common.close')} onClick={close}>
            ×
          </button>
        </AccountDialog>
      )}
    </>
  )
}

/**
 * The account dialog as a native modal (#44): focus stays in it, the page behind is inert, and Escape or a click on
 * the backdrop closes it like its close button. Closing gives focus back to what had it when the dialog opened.
 */
function AccountDialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pressedBackdrop = useRef(false)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    return () => {
      element.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="dialog-ram"
      aria-label={label}
      onCancel={(e) => {
        // The route closes it, so history keeps track (close).
        e.preventDefault()
        onClose()
      }}
      // The box inside fills the dialog, so a click on the dialog itself is a click on the backdrop. Only one that also
      // started there: selecting text in a field and letting go outside it is not.
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose()
      }}
    >
      <div className="dialog">{children}</div>
    </dialog>
  )
}
