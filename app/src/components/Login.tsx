import { useState } from 'react'
import { DEMOKONTO, loggaIn, type Anvandare } from '../auth'
import { analysKomplett, demoHast } from '../data/exempel'
import produkterJson from '../data/products.json'
import { byggBoxkort } from '../domain/boxkort'
import { kostnadPerManad } from '../domain/intake'
import { skapaPlan } from '../domain/plan'
import type { Produkt } from '../domain/types'
import { Boxkort } from './Boxkort'

// Exemplet på startsidan räknas fram av samma motor som i appen.
const exempelPlan = skapaPlan(demoHast, analysKomplett, produkterJson as Produkt[])
const exempelKort = byggBoxkort(exempelPlan, 'hosilage')
const exempelKostnad = [...exempelPlan.behallnaFoder, ...(exempelPlan.urval?.poster ?? [])].reduce(
  (s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag),
  0,
)

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
      <section className="login-varumarke">
        <div className="logga">Fodr</div>
        <h1 className="login-rubrik">Från foderanalys till boxkort.</h1>
        <p className="login-text">
          Ladda upp grovfoderanalysen och beskriv hästen. Fodr räknar behovet enligt SLU:s rekommendationer och
          föreslår svenska produkter, i gram per mål och kronor per månad.
        </p>
        <div className="login-exempel">
          <Boxkort namn="Sixten" datum="14 oktober 2026" kort={exempelKort} kostnadPerManad={exempelKostnad} kostnadIdag={exempelPlan.nulageKostnadPerManad} />
        </div>
      </section>

      <section className="login-kort">
        <h2>{lage === 'logga_in' ? 'Logga in' : 'Skapa konto'}</h2>
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
          <button className="knapp bred" type="submit">
            {lage === 'logga_in' ? 'Logga in' : 'Skapa konto'}
          </button>
        </form>
        <button className="lank" onClick={() => setLage(lage === 'logga_in' ? 'skapa' : 'logga_in')}>
          {lage === 'logga_in' ? 'Ny här? Skapa konto' : 'Har du redan ett konto? Logga in'}
        </button>
        <div className="login-skiljare">eller</div>
        <button className="knapp sekundar bred" onClick={() => onInloggad(loggaIn(DEMOKONTO.epost))}>
          Testa med demokontot
        </button>
        <p className="liten login-not">Prototyp: lösenordet kontrolleras inte och allt sparas bara i den här webbläsaren.</p>
      </section>
    </div>
  )
}
