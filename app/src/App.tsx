import { useEffect, useMemo, useState } from 'react'
import './App.css'
import produkterJson from './data/products.json'
import type { Grovfoderanalys, Hastprofil, Produkt } from './domain/types'
import type { Omrakning } from './domain/analysis'
import { skapaPlan } from './domain/plan'
import { laddaHastar, sparaHastar } from './storage'
import { aktuellAnvandare, loggaUt, type Anvandare } from './auth'
import { Login } from './components/Login'
import { HorseStep } from './components/HorseStep'
import { AnalysisStep } from './components/AnalysisStep'
import { PlanStep } from './components/PlanStep'

const produkter = produkterJson as Produkt[]
type Steg = 'hast' | 'analys' | 'plan'

export default function App() {
  const [anvandare, setAnvandare] = useState<Anvandare | null>(aktuellAnvandare)
  if (!anvandare) return <Login onInloggad={setAnvandare} />
  return (
    <Arbetsyta
      key={anvandare.id}
      anvandare={anvandare}
      onLoggaUt={() => {
        loggaUt()
        setAnvandare(null)
      }}
    />
  )
}

function Arbetsyta({ anvandare, onLoggaUt }: { anvandare: Anvandare; onLoggaUt: () => void }) {
  const [hastar, setHastar] = useState<Hastprofil[]>(() => laddaHastar(anvandare.id))
  const [valdId, setValdId] = useState(hastar[0]?.id)
  const [steg, setSteg] = useState<Steg>('hast')
  const [analys, setAnalys] = useState<Grovfoderanalys | null>(null)
  const [omrakningar, setOmrakningar] = useState<Omrakning[]>([])

  useEffect(() => sparaHastar(anvandare.id, hastar), [anvandare.id, hastar])
  const hast = hastar.find((h) => h.id === valdId) ?? hastar[0]

  const plan = useMemo(() => {
    if (!hast || !analys) return null
    try {
      return { ok: skapaPlan({ ...hast, grovfoder: { ...hast.grovfoder, typ: analys.typ } }, analys, produkter) }
    } catch (e) {
      return { fel: e instanceof Error ? e.message : String(e) }
    }
  }, [hast, analys])

  const uppdateraHast = (h: Hastprofil) => setHastar((alla) => alla.map((x) => (x.id === h.id ? h : x)))

  return (
    <div className="app">
      <header className="topp">
        <div className="logga">Krubba</div>
        <nav className="steg">
          {(
            [
              ['hast', '1', 'Hästen'],
              ['analys', '2', 'Analysen'],
              ['plan', '3', 'Foderplan'],
            ] as const
          ).map(([id, nr, text]) => (
            <button
              key={id}
              className={`steg-knapp ${steg === id ? 'aktiv' : ''}`}
              disabled={(id === 'analys' && !hast) || (id === 'plan' && !analys)}
              onClick={() => setSteg(id)}
            >
              <span className="nr">{nr}</span>
              {text}
            </button>
          ))}
        </nav>
        <div className="konto">
          <span className="konto-avatar">{anvandare.namn.slice(0, 1).toUpperCase()}</span>
          <span className="konto-namn">{anvandare.namn}</span>
          <button className="konto-ut" onClick={onLoggaUt}>
            Logga ut
          </button>
        </div>
      </header>

      <main className="innehall">
        {steg === 'hast' && (
          <HorseStep
            hastar={hastar}
            vald={hast}
            produkter={produkter}
            onValj={setValdId}
            onAndra={uppdateraHast}
            onNy={(h) => {
              setHastar((alla) => [...alla, h])
              setValdId(h.id)
            }}
            onVidare={() => setSteg('analys')}
          />
        )}
        {steg === 'analys' && hast && (
          <AnalysisStep
            hast={hast}
            analys={analys}
            omrakningar={omrakningar}
            onAnalys={(a, o) => {
              setAnalys(a)
              setOmrakningar(o)
            }}
            onVidare={() => setSteg('plan')}
          />
        )}
        {steg === 'plan' && hast && analys && plan && (
          'fel' in plan ? (
            <div className="ruta fel">{plan.fel}</div>
          ) : (
            <PlanStep hast={hast} analys={analys} plan={plan.ok!} />
          )
        )}
      </main>
      <footer className="fot">
        Behov enligt SLU Rapport 289, Utfodringsrekommendationer för häst (2013). Prototyp, ersätter inte
        veterinär eller foderrådgivare.
      </footer>
    </div>
  )
}
