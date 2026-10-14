import { useEffect, useMemo, useState } from 'react'
import './App.css'
import produkterJson from './data/products.json'
import type { Hastprofil, Produkt } from './domain/types'
import { skapaPlan } from './domain/plan'
import { hittaRas } from './domain/raser'
import { ogonblickAvPlan, nyPost, type Journalpost } from './domain/journal'
import {
  laddaAnalyser,
  laddaHastar,
  laddaJournal,
  nyHast,
  sparaAnalyser,
  sparaHastar,
  sparaJournal,
  type SparadAnalys,
} from './storage'
import { aktuellAnvandare, loggaUt, type Anvandare } from './auth'
import { Login } from './components/Login'
import { HorseStep } from './components/HorseStep'
import { AnalysisStep } from './components/AnalysisStep'
import { PlanStep } from './components/PlanStep'
import { JournalStep } from './components/JournalStep'
import { HULL_TEXT } from './format'

const produkter = produkterJson as Produkt[]
type Flik = 'profil' | 'analys' | 'plan' | 'journal'
const FLIKAR: { id: Flik; namn: string }[] = [
  { id: 'profil', namn: 'Profil' },
  { id: 'analys', namn: 'Analys' },
  { id: 'plan', namn: 'Foderplan' },
  { id: 'journal', namn: 'Journal' },
]
const idag = () => new Date().toISOString().slice(0, 10)

/** Läser #/häst-id/flik så att en omladdning hamnar på samma ställe. */
function lasHash(): { hastId?: string; flik?: Flik } {
  const [, hastId, flik] = window.location.hash.split('/')
  return { hastId, flik: FLIKAR.some((f) => f.id === flik) ? (flik as Flik) : undefined }
}

export default function App() {
  const [anvandare, setAnvandare] = useState<Anvandare | null>(aktuellAnvandare)
  if (!anvandare) return <Login onInloggad={setAnvandare} />
  return (
    <Arbetsyta
      key={anvandare.id}
      anvandare={anvandare}
      onLoggaUt={() => {
        loggaUt()
        history.replaceState(null, '', window.location.pathname)
        setAnvandare(null)
      }}
    />
  )
}

function Arbetsyta({ anvandare, onLoggaUt }: { anvandare: Anvandare; onLoggaUt: () => void }) {
  const [hastar, setHastar] = useState<Hastprofil[]>(() => laddaHastar(anvandare.id))
  const [journal, setJournal] = useState<Record<string, Journalpost[]>>(() => laddaJournal(anvandare.id))
  const [analyser, setAnalyser] = useState<Record<string, SparadAnalys>>(() => laddaAnalyser(anvandare.id))
  const [start] = useState(lasHash)
  const [valdId, setValdId] = useState(start.hastId ?? hastar[0]?.id)
  const [flik, setFlik] = useState<Flik>(start.flik ?? 'profil')

  useEffect(() => sparaHastar(anvandare.id, hastar), [anvandare.id, hastar])
  useEffect(() => sparaJournal(anvandare.id, journal), [anvandare.id, journal])
  useEffect(() => sparaAnalyser(anvandare.id, analyser), [anvandare.id, analyser])

  const hast = hastar.find((h) => h.id === valdId) ?? hastar[0]
  const sparad = hast ? analyser[hast.id] : undefined
  const analys = sparad?.analys ?? null

  useEffect(() => {
    if (hast) history.replaceState(null, '', `#/${hast.id}/${flik}`)
  }, [hast, flik])

  const plan = useMemo(() => {
    if (!hast || !analys) return null
    try {
      return { ok: skapaPlan({ ...hast, grovfoder: { ...hast.grovfoder, typ: analys.typ } }, analys, produkter) }
    } catch (e) {
      return { fel: e instanceof Error ? e.message : String(e) }
    }
  }, [hast, analys])

  const uppdateraHast = (h: Hastprofil) => setHastar((alla) => alla.map((x) => (x.id === h.id ? h : x)))
  const laggTillPost = (hastId: string, post: Journalpost) =>
    setJournal((j) => ({ ...j, [hastId]: [...(j[hastId] ?? []), post] }))
  const planOgonblick = plan && 'ok' in plan && analys ? ogonblickAvPlan(plan.ok!, analys) : null
  const laggTillHast = () => {
    const h = nyHast()
    setHastar((alla) => [...alla, h])
    setValdId(h.id)
    setFlik('profil')
  }

  const lasFlik = (id: Flik): string | null => {
    if (id === 'analys' && !hast?.namn) return 'Ge hästen ett namn först'
    if (id === 'plan' && !analys) return 'Lägg in en grovfoderanalys först'
    return null
  }

  return (
    <div className="skal">
      <aside className="stall" aria-label="Stallet">
        <div className="logga">Fodr</div>
        <h2 className="stall-rubrik">Stallet</h2>
        <ul className="boxar">
          {hastar.map((h) => (
            <li key={h.id}>
              <button
                className={`box ${h.id === hast?.id ? 'vald' : ''}`}
                aria-current={h.id === hast?.id ? 'page' : undefined}
                onClick={() => setValdId(h.id)}
              >
                <span className="box-namn">{h.namn || 'Ny häst'}</span>
                <span className="box-fakta">{hittaRas(h.ras)?.namn.split(' /')[0] ?? `${h.viktKg} kg`}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="ny-hast" onClick={laggTillHast}>
          Lägg till häst
        </button>
        <div className="konto">
          <span className="konto-namn">{anvandare.namn}</span>
          <button className="konto-ut" onClick={onLoggaUt}>
            Logga ut
          </button>
        </div>
      </aside>

      <main className="sida">
        {!hast ? (
          <section className="valkommen">
            <h1>Välkommen till Fodr</h1>
            <p className="ingress">
              Lägg till din häst, ladda upp grovfoderanalysen och få ett boxkort med vad hästen ska äta morgon och kväll.
            </p>
            <button className="knapp" onClick={laggTillHast}>
              Lägg till din första häst
            </button>
          </section>
        ) : (
          <>
            <header className="hasthuvud">
              <h1>{hast.namn || 'Ny häst'}</h1>
              <dl className="hastfakta">
                <div>
                  <dt>Ras</dt>
                  <dd>{hittaRas(hast.ras)?.namn ?? 'Ej angiven'}</dd>
                </div>
                <div>
                  <dt>Ålder</dt>
                  <dd>{hast.alderAr} år</dd>
                </div>
                <div>
                  <dt>Vikt</dt>
                  <dd>{hast.viktKg} kg</dd>
                </div>
                <div>
                  <dt>Hull</dt>
                  <dd>
                    {hast.hull}, {HULL_TEXT[hast.hull].toLowerCase()}
                  </dd>
                </div>
              </dl>
              <nav className="flikar" aria-label="Hästens sidor">
                {FLIKAR.map((f) => {
                  const last = lasFlik(f.id)
                  return (
                    <button
                      key={f.id}
                      className={`flik ${flik === f.id ? 'aktiv' : ''}`}
                      aria-current={flik === f.id ? 'page' : undefined}
                      disabled={Boolean(last)}
                      title={last ?? undefined}
                      onClick={() => setFlik(f.id)}
                    >
                      {f.namn}
                    </button>
                  )
                })}
              </nav>
            </header>

            {flik === 'profil' && (
              <HorseStep
                key={hast.id}
                hast={hast}
                produkter={produkter}
                onAndra={uppdateraHast}
                onVidare={() => setFlik('analys')}
              />
            )}
            {flik === 'analys' && (
              <AnalysisStep
                hast={hast}
                analys={analys}
                omrakningar={sparad?.omrakningar ?? []}
                onAnalys={(a, o) => setAnalyser((alla) => ({ ...alla, [hast.id]: { analys: a, omrakningar: o } }))}
                onVidare={() => setFlik('plan')}
              />
            )}
            {flik === 'plan' && analys && plan && (
              'fel' in plan ? (
                <p className="fel-rad" role="alert">
                  {plan.fel}
                </p>
              ) : (
                <PlanStep
                  hast={hast}
                  analys={analys}
                  plan={plan.ok!}
                  onSparaIJournal={() => {
                    laggTillPost(hast.id, nyPost(idag(), { text: '', plan: planOgonblick! }))
                    setFlik('journal')
                  }}
                />
              )
            )}
            {flik === 'journal' && (
              <JournalStep
                hast={hast}
                poster={journal[hast.id] ?? []}
                aktuellPlan={planOgonblick}
                idag={idag()}
                onLaggTill={(post, uppdateraProfil) => {
                  laggTillPost(hast.id, post)
                  if (uppdateraProfil) {
                    uppdateraHast({ ...hast, viktKg: post.viktKg ?? hast.viktKg, hull: post.hull ?? hast.hull })
                  }
                }}
              />
            )}
          </>
        )}
        <footer className="fot">
          Behov enligt SLU Rapport 289, Utfodringsrekommendationer för häst. Fodr är en prototyp och ersätter inte
          veterinär eller foderrådgivare.
        </footer>
      </main>
    </div>
  )
}
