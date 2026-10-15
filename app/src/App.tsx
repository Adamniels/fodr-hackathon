import { useEffect, useMemo, useState } from 'react'
import './App.css'
import produkterJson from './data/products.json'
import type { Grovfoderanalys, Hastprofil, Produkt } from './domain/types'
import type { Omrakning } from './domain/analysis'
import { skapaPlan } from './domain/plan'
import { laddaHastar, laddaJournal, nyHast, sparaHastar, sparaJournal } from './storage'
import { ogonblickAvPlan, nyPost, type Journalpost } from './domain/journal'
import { hittaRas } from './domain/raser'
import { DEMOKONTO, aktuellAnvandare, loggaIn, loggaUt, type Anvandare } from './auth'
import { HULL_TEXT } from './format'
import { Login } from './components/Login'
import { Startsida } from './components/Startsida'
import { HorseStep } from './components/HorseStep'
import { AnalysisStep } from './components/AnalysisStep'
import { PlanStep } from './components/PlanStep'
import { JournalStep } from './components/JournalStep'
import { Ordmarke } from './components/Varumarke'

const produkter = produkterJson as Produkt[]
type Steg = 'hast' | 'analys' | 'plan' | 'journal'
const idag = () => new Date().toISOString().slice(0, 10)

const STEG: [Steg, string][] = [
  ['hast', 'Hästen'],
  ['analys', 'Analysen'],
  ['plan', 'Foderplan'],
  ['journal', 'Journal'],
]

export default function App() {
  const [anvandare, setAnvandare] = useState<Anvandare | null>(aktuellAnvandare)
  const [visaStart, setVisaStart] = useState(() => !aktuellAnvandare())
  const [visaLogin, setVisaLogin] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [visaStart])

  const oppna = (a: Anvandare) => {
    setAnvandare(a)
    setVisaLogin(false)
    setVisaStart(false)
  }

  if (!anvandare || visaStart) {
    return (
      <>
        <Startsida
          produkter={produkter}
          inloggadSom={anvandare?.namn ?? null}
          onDemo={() => oppna(anvandare ?? loggaIn(DEMOKONTO.epost))}
          onLoggaIn={() => setVisaLogin(true)}
        />
        {visaLogin && (
          <div className="dialog-bakgrund" onClick={() => setVisaLogin(false)}>
            <div
              className="dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Logga in"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="dialog-stang" aria-label="Stäng" onClick={() => setVisaLogin(false)}>
                ×
              </button>
              <Login onInloggad={oppna} />
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <Arbetsyta
      key={anvandare.id}
      anvandare={anvandare}
      onStartsida={() => setVisaStart(true)}
      onLoggaUt={() => {
        loggaUt()
        setAnvandare(null)
        setVisaStart(true)
      }}
    />
  )
}

/* Arbetsytan: sidofält med hästarna, varje häst som en egen sida med omslag, egenskaper och flikar. */
function Arbetsyta({
  anvandare,
  onStartsida,
  onLoggaUt,
}: {
  anvandare: Anvandare
  onStartsida: () => void
  onLoggaUt: () => void
}) {
  const [hastar, setHastar] = useState<Hastprofil[]>(() => laddaHastar(anvandare.id))
  const [valdId, setValdId] = useState(hastar[0]?.id)
  const [steg, setSteg] = useState<Steg>('hast')
  const [analys, setAnalys] = useState<Grovfoderanalys | null>(null)
  const [omrakningar, setOmrakningar] = useState<Omrakning[]>([])
  const [journal, setJournal] = useState<Record<string, Journalpost[]>>(() => laddaJournal(anvandare.id))
  const [menyOppen, setMenyOppen] = useState(false)

  useEffect(() => sparaHastar(anvandare.id, hastar), [anvandare.id, hastar])
  useEffect(() => sparaJournal(anvandare.id, journal), [anvandare.id, journal])
  const hast = hastar.find((h) => h.id === valdId) ?? hastar[0]

  const plan = useMemo(() => {
    if (!hast || !analys) return null
    try {
      return { ok: skapaPlan({ ...hast, grovfoder: { ...hast.grovfoder, typ: analys.typ } }, analys, produkter) }
    } catch (e) {
      return { fel: e instanceof Error ? e.message : String(e) }
    }
  }, [hast, analys])

  function gaTill(s: Steg) {
    setSteg(s)
    window.scrollTo({ top: 0 })
  }
  const valjHast = (id: string) => {
    setValdId(id)
    setMenyOppen(false)
  }
  const uppdateraHast = (h: Hastprofil) => setHastar((alla) => alla.map((x) => (x.id === h.id ? h : x)))
  const laggTillHast = (h: Hastprofil) => {
    setHastar((alla) => [...alla, h])
    valjHast(h.id)
    gaTill('hast')
  }
  const laggTillPost = (hastId: string, post: Journalpost) =>
    setJournal((j) => ({ ...j, [hastId]: [...(j[hastId] ?? []), post] }))
  const planOgonblick = plan && 'ok' in plan && analys ? ogonblickAvPlan(plan.ok!, analys) : null

  const tillganglig = (s: Steg) => (s === 'plan' ? Boolean(hast && analys) : s === 'hast' || Boolean(hast))
  const ras = hast ? hittaRas(hast.ras) : undefined
  const initial = (h?: Hastprofil) => (h?.namn || '?').slice(0, 1).toUpperCase()

  return (
    <div className={`arbetsyta ${menyOppen ? 'meny-oppen' : ''}`}>
      <aside className="sidofalt" aria-label="Hästar">
        <div className="sidofalt-topp">
          <Ordmarke />
          <button className="sidofalt-stang" aria-label="Stäng menyn" onClick={() => setMenyOppen(false)}>
            ×
          </button>
        </div>
        <p className="sidofalt-rubrik">Mina hästar</p>
        <ul className="hastlista">
          {hastar.map((h) => (
            <li key={h.id}>
              <button
                className={`hastrad ${h.id === hast?.id ? 'vald' : ''}`}
                aria-current={h.id === hast?.id ? 'page' : undefined}
                onClick={() => valjHast(h.id)}
              >
                <span className="hast-ikon">{initial(h)}</span>
                <span className="hastrad-namn">{h.namn || 'Namnlös häst'}</span>
              </button>
            </li>
          ))}
          <li>
            <button className="hastrad ny" onClick={() => laggTillHast(nyHast())}>
              <span className="hast-ikon">+</span>
              <span className="hastrad-namn">Lägg till häst</span>
            </button>
          </li>
        </ul>

        <div className="sidofalt-fot">
          <div className="konto">
            <span className="konto-ikon">{anvandare.namn.slice(0, 1).toUpperCase()}</span>
            <span className="konto-text">
              <b>{anvandare.namn}</b>
              <span>{anvandare.epost}</span>
            </span>
          </div>
          <button className="sidofalt-lank" onClick={onStartsida}>
            Till startsidan
          </button>
          <button className="sidofalt-lank" onClick={onLoggaUt}>
            Logga ut
          </button>
        </div>
      </aside>
      <div className="meny-skugga" onClick={() => setMenyOppen(false)} aria-hidden />

      <div className="sidan">
        <header className="mobilrad">
          <button className="menyknapp" aria-label="Visa hästar och meny" onClick={() => setMenyOppen(true)}>
            <span />
            <span />
            <span />
          </button>
          <span className="mobilrad-titel">{hast?.namn || 'Fodr'}</span>
        </header>

        <div className="omslag" style={{ backgroundImage: 'url(/bilder/nosar.webp)' }} role="img" aria-label="" />

        <div className="sidinnehall">
          <div className="sid-ikon" aria-hidden>
            {initial(hast)}
          </div>
          <h1 className="sid-titel">{hast?.namn || 'Ny häst'}</h1>

          {hast && (
            <dl className="egenskaper">
              <div>
                <dt>Ålder</dt>
                <dd>{hast.alderAr} år</dd>
              </div>
              <div>
                <dt>Ras</dt>
                <dd>{ras?.namn ?? 'Ej angiven'}</dd>
              </div>
              <div>
                <dt>Vikt</dt>
                <dd>{hast.viktKg} kg</dd>
              </div>
              <div>
                <dt>Hull</dt>
                <dd>
                  {hast.hull} av 9, {HULL_TEXT[hast.hull]?.toLowerCase()}
                </dd>
              </div>
              <div>
                <dt>Grovfoder</dt>
                <dd>
                  {hast.grovfoder.kgPerDag} kg {hast.grovfoder.typ === 'ho' ? 'hö' : 'hösilage'} per dag
                </dd>
              </div>
              <div>
                <dt>Analys</dt>
                <dd>
                  {analys
                    ? `${analys.labb ?? 'Uppladdad'}${analys.provdatum ? `, prov ${analys.provdatum}` : ''}`
                    : 'Inte uppladdad än'}
                </dd>
              </div>
            </dl>
          )}

          <nav className="flikar" aria-label="Steg">
            {STEG.map(([id, text], i) => (
              <button
                key={id}
                className={steg === id ? 'vald' : ''}
                aria-current={steg === id ? 'page' : undefined}
                disabled={!tillganglig(id)}
                onClick={() => gaTill(id)}
              >
                <span className="flik-nr">{i + 1}</span>
                {text}
              </button>
            ))}
          </nav>

          <main className="stegyta">
            {steg === 'hast' && (
              <HorseStep
                vald={hast}
                produkter={produkter}
                onAndra={uppdateraHast}
                onNy={laggTillHast}
                onVidare={() => gaTill('analys')}
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
                onVidare={() => gaTill('plan')}
              />
            )}
            {steg === 'plan' &&
              hast &&
              analys &&
              plan &&
              ('fel' in plan ? (
                <div className="ruta fel">{plan.fel}</div>
              ) : (
                <PlanStep
                  hast={hast}
                  analys={analys}
                  plan={plan.ok!}
                  onSparaIJournal={() => {
                    laggTillPost(hast.id, nyPost(idag(), { text: '', plan: planOgonblick! }))
                    gaTill('journal')
                  }}
                />
              ))}
            {steg === 'journal' && hast && (
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
          </main>
          <p className="fotnot">
            Behov enligt SLU Rapport 289, Utfodringsrekommendationer för häst (2013). Prototyp, ersätter inte veterinär
            eller foderrådgivare.
          </p>
        </div>
      </div>
    </div>
  )
}
