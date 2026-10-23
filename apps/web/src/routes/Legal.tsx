// The beta terms and the privacy notice (#42): public pages, texts in the i18n catalogue (legal.*), each dated
// (TERMS_VERSION, which users accept; PRIVACY_UPDATED, which they only read). AcceptTerms asks a signed-in user on an
// older version to accept the current one before the workspace, and lets them export, delete or log out instead. The
// API does not refuse an outdated version: the web asks (ADR 0009 note).
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PRIVACY_UPDATED, TERMS_VERSION } from '@fodr/contracts/terms'
import { ApiError } from '../api-v1'
import { DeleteAccount } from '../components/DeleteAccount'
import { LogOutFailed } from '../components/LogOutFailed'
import { formatDate } from '../format'
import { useAcceptTerms } from '../terms'
import { useSession } from './session'

interface Section {
  heading: string
  paragraphs: string[]
}

function LegalPage({ text }: { text: 'privacy' | 'terms' }) {
  const { t } = useTranslation()
  const sections = t(`legal.${text}.sections`, { returnObjects: true }) as Section[]
  return (
    <main className="juridik">
      <p>
        <Link to="/">{t('legal.toStart')}</Link>
      </p>
      <h1>{t(`legal.${text}.title`)}</h1>
      <p className="liten">
        {t('legal.updated', { date: formatDate(text === 'terms' ? TERMS_VERSION : PRIVACY_UPDATED) })}
      </p>
      {sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      <p className="liten">{t('legal.draftNote')}</p>
    </main>
  )
}

export const PrivacyPage = () => <LegalPage text="privacy" />
export const TermsPage = () => <LegalPage text="terms" />

/** Before the workspace: the current terms, when the user accepted an older version (or none, before #42). */
export function AcceptTerms({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const session = useSession()
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'acceptFailed' | 'outdated' | null>(null)
  const acceptTerms = useAcceptTerms()
  if (!session.user || session.user.termsVersion === TERMS_VERSION) return <>{children}</>

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      await acceptTerms()
    } catch (e) {
      // A 400 means the server's terms are newer than this page's: only a reload shows them.
      setError(e instanceof ApiError && e.status === 400 ? 'outdated' : 'acceptFailed')
      setBusy(false)
    }
  }
  return (
    <main className="juridik">
      <h1>{t('legal.consent.newTitle')}</h1>
      <p>{t('legal.consent.newBody')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void accept()
        }}
      >
        <label className="falt kryss">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            <Trans
              i18nKey="legal.consent.label"
              components={{
                terms: <a href="/villkor" target="_blank" rel="noreferrer" />,
                privacy: <a href="/integritet" target="_blank" rel="noreferrer" />,
              }}
            />
          </span>
        </label>
        {error && (
          <p className="ruta fel" role="alert">
            {t(`legal.consent.${error}`)}
          </p>
        )}
        <button className="knapp" type="submit" disabled={!consent || busy}>
          {t('legal.consent.accept')}
        </button>
      </form>
      {/* Not accepting must not trap anyone: their data and their account stay theirs (GDPR, #42 review). */}
      <h2>{t('legal.consent.otherwise')}</h2>
      <LogOutFailed />
      <div className="atgardsrad">
        <a className="sidofalt-lank" href="/api/v1/me/export" download>
          {t('app.sidebar.export')}
        </a>
        <DeleteAccount />
        <button className="sidofalt-lank" onClick={() => void session.logOut()}>
          {t('app.sidebar.logOut')}
        </button>
      </div>
    </main>
  )
}
