import { useState } from 'react'
import { DEMOKONTO, loggaIn, type Anvandare } from '../auth'

export function Login({ onInloggad }: { onInloggad: (a: Anvandare) => void }) {
  const [lage, setLage] = useState<'logga_in' | 'skapa'>('logga_in')
  const [epost, setEpost] = useState('')
  const [namn, setNamn] = useState('')
  const [losenord, setLosenord] = useState('')
  const [fel, setFel] = useState<string | null>(null)

  function skicka(e: React.FormEvent) {
    e.preventDefault()
    setFel(null)
    try {
      onInloggad(loggaIn(epost, lage === 'skapa' ? namn : undefined))
    } catch (err) {
      setFel(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="login">
      <h2>{lage === 'logga_in' ? 'Logga in på Fodr' : 'Skapa konto'}</h2>
      <p className="ingress">Dina hästar och foderplaner sparas på ditt konto.</p>

      <button className="knapp bred" onClick={() => onInloggad(loggaIn(DEMOKONTO.epost))}>
        Fortsätt med demohästen Sixten
      </button>
      <div className="login-skiljare">
        <span>eller med e-post</span>
      </div>

      <form onSubmit={skicka}>
        {lage === 'skapa' && (
          <label className="falt">
            <span className="falt-label">Namn</span>
            <input value={namn} onChange={(e) => setNamn(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label className="falt">
          <span className="falt-label">E-post</span>
          <input type="email" value={epost} onChange={(e) => setEpost(e.target.value)} autoComplete="email" required />
        </label>
        <label className="falt">
          <span className="falt-label">Lösenord</span>
          <input
            type="password"
            value={losenord}
            onChange={(e) => setLosenord(e.target.value)}
            autoComplete={lage === 'skapa' ? 'new-password' : 'current-password'}
          />
        </label>
        {fel && <div className="ruta fel">{fel}</div>}
        <button className="knapp sekundar bred" type="submit">
          {lage === 'logga_in' ? 'Logga in' : 'Skapa konto'}
        </button>
      </form>
      <button className="lank login-byt" onClick={() => setLage(lage === 'logga_in' ? 'skapa' : 'logga_in')}>
        {lage === 'logga_in' ? 'Ny här? Skapa konto' : 'Har du redan ett konto? Logga in'}
      </button>
      <p className="liten login-not">
        Prototyp: lösenordet kontrolleras inte och allt sparas bara i den här webbläsaren.
      </p>
    </div>
  )
}
