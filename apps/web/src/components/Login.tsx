import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEMO_ACCOUNT, logIn, type User } from '../auth'

export function Login({ onLoggedIn }: { onLoggedIn: (a: User) => void }) {
  const { t } = useTranslation()
  const [lage, setLage] = useState<'logga_in' | 'skapa'>('logga_in')
  const [epost, setEpost] = useState('')
  const [namn, setNamn] = useState('')
  const [losenord, setLosenord] = useState('')
  const [fel, setFel] = useState<string | null>(null)

  function skicka(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setFel(null)
    try {
      onLoggedIn(logIn(epost, lage === 'skapa' ? namn : undefined))
    } catch (err) {
      setFel(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="login">
      <h2>{lage === 'logga_in' ? t('login.titleLogIn') : t('login.titleCreate')}</h2>
      <p className="ingress">{t('login.intro')}</p>

      <button className="knapp bred" onClick={() => onLoggedIn(logIn(DEMO_ACCOUNT.epost))}>
        {t('login.demo')}
      </button>
      <div className="login-skiljare">
        <span>{t('login.orEmail')}</span>
      </div>

      <form onSubmit={skicka}>
        {lage === 'skapa' && (
          <label className="falt">
            <span className="falt-label">{t('login.name')}</span>
            <input value={namn} onChange={(e) => setNamn(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label className="falt">
          <span className="falt-label">{t('login.email')}</span>
          <input type="email" value={epost} onChange={(e) => setEpost(e.target.value)} autoComplete="email" required />
        </label>
        <label className="falt">
          <span className="falt-label">{t('login.password')}</span>
          <input
            type="password"
            value={losenord}
            onChange={(e) => setLosenord(e.target.value)}
            autoComplete={lage === 'skapa' ? 'new-password' : 'current-password'}
          />
        </label>
        {fel && <div className="ruta fel">{fel}</div>}
        <button className="knapp sekundar bred" type="submit">
          {lage === 'logga_in' ? t('login.submitLogIn') : t('login.submitCreate')}
        </button>
      </form>
      <button className="lank login-byt" onClick={() => setLage(lage === 'logga_in' ? 'skapa' : 'logga_in')}>
        {lage === 'logga_in' ? t('login.switchToCreate') : t('login.switchToLogIn')}
      </button>
      <p className="liten login-not">{t('login.note')}</p>
    </div>
  )
}
