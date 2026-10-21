import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthError, authClient } from '../auth-client'
import { authErrorText } from '../i18n/auth'

export type LoginMode = 'logIn' | 'signUp' | 'magicLink' | 'forgot'

interface Props {
  /** A password login succeeded; the parent reads the session. */
  onLoggedIn: () => void
  onDemo: () => void
  initialMode?: LoginMode
  /** A mailed link failed (expired, used or invalid): /login?error=… from the API. */
  linkFailed?: boolean
}

// The account dialog (#23, CF1): log in with a password, sign up, a login link by mail, or a link for a new password.
// What happens after a mailed link is the API's (Better Auth); this only asks for it and says where to look.
export function Login({ onLoggedIn, onDemo, initialMode = 'logIn', linkFailed = false }: Props) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<LoginMode>(initialMode)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  // A mailed link failed: said once, with a way to a new link, until the user does something else.
  const [linkProblem, setLinkProblem] = useState(linkFailed)
  const [notVerified, setNotVerified] = useState(false)
  const [resent, setResent] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Focus follows each change of form or state to its heading, so a keyboard or screen reader user is told where they
  // are; the button they pressed is often gone.
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    heading.current?.focus()
  }, [mode, sentTo])

  const switchTo = (next: LoginMode) => {
    setMode(next)
    setError(null)
    setLinkProblem(false)
    setNotVerified(false)
    setResent(false)
    setSentTo(null)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      const code = err instanceof AuthError ? err.code : 'UNKNOWN'
      if (code === 'EMAIL_NOT_VERIFIED') setNotVerified(true)
      else setError(authErrorText(code))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setNotVerified(false)
    setResent(false)
    setLinkProblem(false)
    if (mode === 'signUp' && name.trim() === '') {
      setError(authErrorText('NAME_REQUIRED'))
      return
    }
    void run(async () => {
      if (mode === 'logIn') {
        await authClient.signIn(email, password)
        onLoggedIn()
      } else if (mode === 'signUp') {
        await authClient.signUp(name.trim(), email, password)
        setSentTo(email)
      } else if (mode === 'magicLink') {
        await authClient.sendMagicLink(email)
        setSentTo(email)
      } else {
        await authClient.requestPasswordReset(email)
        setSentTo(email)
      }
    })
  }

  const resend = () =>
    void run(async () => {
      await authClient.sendVerification(email)
      setResent(true)
    })

  if (sentTo) {
    const text = {
      signUp: t('login.checkEmailSignUp', { email: sentTo }),
      magicLink: t('login.checkEmailMagicLink', { email: sentTo }),
      forgot: t('login.checkEmailForgot', { email: sentTo }),
      logIn: '',
    }[mode]
    return (
      <div className="login">
        <h2 ref={heading} tabIndex={-1}>
          {t('login.checkEmailTitle')}
        </h2>
        <p className="ingress">{text}</p>
        {mode === 'signUp' && (
          <button className="knapp sekundar bred" onClick={resend} disabled={busy}>
            {t('login.resend')}
          </button>
        )}
        {resent && (
          <div className="ruta" role="status">
            {t('login.resent')}
          </div>
        )}
        {error && (
          <div className="ruta fel" role="alert">
            {error}
          </div>
        )}
        <button className="lank login-byt" onClick={() => switchTo('logIn')}>
          {t('login.backToLogIn')}
        </button>
      </div>
    )
  }

  const titles = {
    logIn: t('login.titleLogIn'),
    signUp: t('login.titleCreate'),
    magicLink: t('login.titleMagicLink'),
    forgot: t('login.titleForgot'),
  }
  const intros = {
    logIn: t('login.intro'),
    signUp: t('login.intro'),
    magicLink: t('login.introMagicLink'),
    forgot: t('login.introForgot'),
  }
  const submitLabels = {
    logIn: t('login.submitLogIn'),
    signUp: t('login.submitCreate'),
    magicLink: t('login.submitMagicLink'),
    forgot: t('login.submitForgot'),
  }
  const withPassword = mode === 'logIn' || mode === 'signUp'

  return (
    <div className="login">
      <h2 ref={heading} tabIndex={-1}>
        {titles[mode]}
      </h2>
      <p className="ingress">{intros[mode]}</p>

      {mode === 'logIn' && (
        <>
          <button className="knapp bred" onClick={onDemo}>
            {t('login.demo')}
          </button>
          <div className="login-skiljare">
            <span>{t('login.orEmail')}</span>
          </div>
        </>
      )}

      <form onSubmit={submit}>
        {mode === 'signUp' && (
          <label className="falt">
            <span className="falt-label">{t('login.name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
              required
            />
          </label>
        )}
        <label className="falt">
          <span className="falt-label">{t('login.email')}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {withPassword && (
          <label className="falt">
            <span className="falt-label">{t('login.password')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              minLength={mode === 'signUp' ? 8 : undefined}
              required
            />
            {mode === 'signUp' && <span className="liten">{t('login.passwordHint')}</span>}
          </label>
        )}
        {notVerified && (
          <div className="ruta" role="alert">
            <p>{t('login.notVerified')}</p>
            <button type="button" className="lank" onClick={resend} disabled={busy}>
              {t('login.resend')}
            </button>
            {resent && <p role="status">{t('login.resent')}</p>}
          </div>
        )}
        {linkProblem && (
          <div className="ruta fel" role="alert">
            <p>{t('login.linkFailed')}</p>
            <button type="button" className="lank" onClick={() => switchTo('magicLink')}>
              {t('login.newLink')}
            </button>
          </div>
        )}
        {error && (
          <div className="ruta fel" role="alert">
            {error}
          </div>
        )}
        <button className="knapp sekundar bred" type="submit" disabled={busy}>
          {busy ? t('login.busy') : submitLabels[mode]}
        </button>
      </form>

      {mode === 'logIn' ? (
        <>
          <button className="lank login-byt" onClick={() => switchTo('signUp')}>
            {t('login.switchToCreate')}
          </button>
          <button className="lank login-byt" onClick={() => switchTo('magicLink')}>
            {t('login.switchToMagicLink')}
          </button>
          <button className="lank login-byt" onClick={() => switchTo('forgot')}>
            {t('login.switchToForgot')}
          </button>
        </>
      ) : (
        <button className="lank login-byt" onClick={() => switchTo('logIn')}>
          {mode === 'signUp' ? t('login.switchToLogIn') : t('login.backToLogIn')}
        </button>
      )}
    </div>
  )
}
