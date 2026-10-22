// The beta terms and the privacy notice (#42): public pages, texts in the i18n catalogue (legal.*), the date the
// version a user accepts (TERMS_VERSION). AcceptTerms asks a signed-in user on an older version to accept the current
// one before the workspace.
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { MeResponseSchema } from '@fodr/contracts/me'
import { TERMS_VERSION } from '@fodr/contracts/terms'
import { callApi } from '../api-v1'
import { formatDate } from '../format'
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
      <p className="liten">{t('legal.updated', { date: formatDate(TERMS_VERSION) })}</p>
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
  const [failed, setFailed] = useState(false)
  if (!session.user || session.user.termsVersion === TERMS_VERSION) return <>{children}</>

  const accept = async () => {
    setBusy(true)
    setFailed(false)
    try {
      MeResponseSchema.parse(
        await (await callApi('/me/terms', { method: 'POST', body: JSON.stringify({ version: TERMS_VERSION }) })).json(),
      )
      await session.refresh()
    } catch {
      setFailed(true)
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
        {failed && (
          <p className="ruta fel" role="alert">
            {t('legal.consent.acceptFailed')}
          </p>
        )}
        <button className="knapp" type="submit" disabled={!consent || busy}>
          {t('legal.consent.accept')}
        </button>
      </form>
    </main>
  )
}
