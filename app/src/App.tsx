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
import { AnalysisStep, type Forhandsvisning } from './components/AnalysisStep'
import { PlanStep } from './components/PlanStep'
import { JournalStep } from './components/JournalStep'
import { StalletOversikt } from './components/StalletOversikt'
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
function lasHash(): { hastId?: string; flik?: Flik; stallet: boolean } {
  const [, hastId, flik] = window.location.hash.split('/')
  if (hastId === 'stallet') return { stallet: true }
  return { hastId, flik: FLIKAR.some((f) => f.id === flik) ? (flik as Flik) : undefined, stallet: false }
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
  const [visaStallet, setVisaStallet] = useState(start.stallet)
  // Rapporten som förhandsvisas bredvid värdena. Hålls bara i minnet; filen sparas inte.
  const [forhandsvisningar, setForhandsvisningar] = useState<Record<string, Forhandsvisning | null>>({})

  useEffect(() => sparaHastar(anvandare.id, hastar), [anvandare.id, hastar])
  useEffect(() => sparaJournal(anvandare.id, journal), [anvandare.id, journal])
  useEffect(() => sparaAnalyser(anvandare.id, analyser), [anvandare.id, analyser])

  const hast = hastar.find((h) => h.id === valdId) ?? hastar[0]
  const sparad = hast ? analyser[hast.id] : undefined
  const analys = sparad?.analys ?? null

  useEffect(() => {
    if (visaStallet) history.replaceState(null, '', '#/stallet')
    else if (hast) history.replaceState(null, '', `#/${hast.id}/${flik}`)
  }, [hast, flik, visaStallet])

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
    setVisaStallet(false)
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
        <div className="stall-rad">
          <h2 className="stall-rubrik">Stallet</h2>
          <button
            className={`stall-oversikt ${visaStallet ? 'vald' : ''}`}
            aria-current={visaStallet ? 'page' : undefined}
            onClick={() => setVisaStallet(true)}
          >
            Hela stallet
          </button>
        </div>
        <ul className="boxar">
          {hastar.map((h, i) => {
            const harAnalys = Boolean(analyser[h.id])
            const vald = !visaStallet && h.id === hast?.id
            return (
              <li key={h.id}>
                <button
                  className={`box ${vald ? 'vald' : ''}`}
                  aria-current={vald ? 'page' : undefined}
                  aria-label={`Box ${i + 1}, ${h.namn || 'ny häst'}, ${harAnalys ? 'plan klar' : 'ingen analys'}`}
                  onClick={() => {
                    setValdId(h.id)
                    setVisaStallet(false)
                  }}
                >
                  {/* Karmen står still med mörkt boxinre; bara dörrbladet svänger på gångjärnen. */}
                  <span className="box-dorr" aria-hidden="true">
                    <span className="box-blad">
                      <svg className="box-regel" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path d="M0 58 H100 M0 88 H100 M10 88 L90 58" />
                      </svg>
                      <span className="box-skylt">{h.namn || 'Ny häst'}</span>
                    </span>
                  </span>
                  <span className="box-fot">
                    <span className="box-nr">Box {i + 1}</span>
                    <span className={`box-status ${harAnalys ? 'klar' : ''}`}>{harAnalys ? 'Plan klar' : 'Ingen analys'}</span>
                  </span>
                </button>
              </li>
            )
          })}
          <li>
            <button className="box ledig" onClick={laggTillHast}>
              <span className="box-dorr" aria-hidden="true" />
              <span className="box-fot">
                <span className="box-nr">Ledig box</span>
                <span className="box-status">Lägg till häst</span>
              </span>
            </button>
          </li>
        </ul>
        <div className="konto">
          <span className="konto-namn">{anvandare.namn}</span>
          <button className="konto-ut" onClick={onLoggaUt}>
            Logga ut
          </button>
        </div>
      </aside>

      <main className="sida">
        {visaStallet ? (
          <StalletOversikt
            hastar={hastar}
            analyser={analyser}
            produkter={produkter}
            onOppnaHast={(id, f) => {
              setValdId(id)
              setFlik(f)
              setVisaStallet(false)
            }}
          />
        ) : !hast ? (
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
              <p className="hast-box">Box {hastar.indexOf(hast) + 1}</p>
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
                forhandsvisning={forhandsvisningar[hast.id] ?? null}
                onForhandsvisning={(f) => setForhandsvisningar((alla) => ({ ...alla, [hast.id]: f }))}
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
