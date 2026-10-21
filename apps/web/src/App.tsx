import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import produkterJson from './data/products.json'
import type { Grovfoderanalys, Hastprofil, Produkt } from '@fodr/domain/types'
import type { Omrakning } from '@fodr/domain/analysis'
import { skapaPlan } from '@fodr/domain/plan'
import { laddaHastar, laddaJournal, nyHast, sparaHastar, sparaJournal } from './storage'
import { ogonblickAvPlan, nyPost, type Journalpost } from '@fodr/domain/journal'
import { hittaRas } from '@fodr/domain/breeds'
import { DEMOKONTO, aktuellAnvandare, loggaIn, loggaUt, type Anvandare } from './auth'
import { formatDate, hullText, tal } from './format'
import { Login } from './components/Login'
import { Startsida } from './components/Startsida'
import { HorseStep } from './components/HorseStep'
import { AnalysisStep } from './components/AnalysisStep'
import { PlanStep } from './components/PlanStep'
import { InvalidInput } from './components/InvalidInput'
import { JournalStep } from './components/JournalStep'
import { Ordmarke } from './components/Varumarke'

const produkter = produkterJson as Produkt[]
type Steg = 'hast' | 'analys' | 'plan' | 'journal'
const idag = () => new Date().toISOString().slice(0, 10)

const STEG: Steg[] = ['hast', 'analys', 'plan', 'journal']

export default function App() {
  const { t } = useTranslation()
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
              aria-label={t('login.dialogLabel')}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="dialog-stang" aria-label={t('common.close')} onClick={() => setVisaLogin(false)}>
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
  const { t } = useTranslation()
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

  const plan = useMemo(
    () =>
      hast && analys
        ? skapaPlan({ ...hast, grovfoder: { ...hast.grovfoder, typ: analys.typ } }, analys, produkter)
        : null,
    [hast, analys],
  )

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
  // A saved plan stores its analysis as this text, exactly as before #12. The date stays YYYY-MM-DD because the text
  // is stored as it is; #27 stores the analysis as values instead.
  const savedAnalysisText = (a: Grovfoderanalys) =>
    [t(`roughageTitle.${a.typ}`), a.labb, a.provdatum].filter(Boolean).join(', ')
  const planOgonblick = plan && 'plan' in plan && analys ? ogonblickAvPlan(plan.plan, savedAnalysisText(analys)) : null

  const tillganglig = (s: Steg) => (s === 'plan' ? Boolean(hast && analys) : s === 'hast' || Boolean(hast))
  const ras = hast ? hittaRas(hast.ras) : undefined
  const analysText = (a: Grovfoderanalys) => {
    const lab = a.labb ?? t('app.properties.analysisUploaded')
    return a.provdatum ? t('app.properties.analysisSampled', { lab, date: formatDate(a.provdatum) }) : lab
  }
  const initial = (h?: Hastprofil) => (h?.namn || '?').slice(0, 1).toUpperCase()

  return (
    <div className={`arbetsyta ${menyOppen ? 'meny-oppen' : ''}`}>
      <aside className="sidofalt" aria-label={t('app.sidebar.label')}>
        <div className="sidofalt-topp">
          <Ordmarke />
          <button
            className="sidofalt-stang"
            aria-label={t('app.sidebar.closeMenu')}
            onClick={() => setMenyOppen(false)}
          >
            ×
          </button>
        </div>
        <p className="sidofalt-rubrik">{t('app.sidebar.heading')}</p>
        <ul className="hastlista">
          {hastar.map((h) => (
            <li key={h.id}>
              <button
                className={`hastrad ${h.id === hast?.id ? 'vald' : ''}`}
                aria-current={h.id === hast?.id ? 'page' : undefined}
                onClick={() => valjHast(h.id)}
              >
                <span className="hast-ikon">{initial(h)}</span>
                <span className="hastrad-namn">{h.namn || t('app.sidebar.unnamedHorse')}</span>
              </button>
            </li>
          ))}
          <li>
            <button className="hastrad ny" onClick={() => laggTillHast(nyHast())}>
              <span className="hast-ikon">+</span>
              <span className="hastrad-namn">{t('app.sidebar.addHorse')}</span>
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
            {t('app.sidebar.toLanding')}
          </button>
          <button className="sidofalt-lank" onClick={onLoggaUt}>
            {t('app.sidebar.logOut')}
          </button>
        </div>
      </aside>
      <div className="meny-skugga" onClick={() => setMenyOppen(false)} aria-hidden />

      <div className="sidan">
        <header className="mobilrad">
          <button className="menyknapp" aria-label={t('app.openMenu')} onClick={() => setMenyOppen(true)}>
            <span />
            <span />
            <span />
          </button>
          <span className="mobilrad-titel">{hast?.namn || t('common.brand')}</span>
        </header>

        <div className="omslag" style={{ backgroundImage: 'url(/bilder/nosar.webp)' }} role="img" aria-label="" />

        <div className="sidinnehall">
          <div className="sid-ikon" aria-hidden>
            {initial(hast)}
          </div>
          <h1 className="sid-titel">{hast?.namn || t('app.newHorse')}</h1>

          {hast && (
            <dl className="egenskaper">
              <div>
                <dt>{t('app.properties.age')}</dt>
                <dd>{t('app.properties.ageValue', { years: tal(hast.alderAr, 1) })}</dd>
              </div>
              <div>
                <dt>{t('app.properties.breed')}</dt>
                <dd>{ras?.namn ?? t('app.properties.breedUnknown')}</dd>
              </div>
              <div>
                <dt>{t('app.properties.weight')}</dt>
                <dd>{t('units.kg', { value: tal(hast.viktKg, 1) })}</dd>
              </div>
              <div>
                <dt>{t('app.properties.hull')}</dt>
                <dd>
                  {t('app.properties.hullValue', {
                    hull: tal(hast.hull, 0),
                    text: hullText(hast.hull)?.toLowerCase() ?? '',
                  })}
                </dd>
              </div>
              <div>
                <dt>{t('app.properties.roughage')}</dt>
                <dd>
                  {t('app.properties.roughageValue', {
                    kg: tal(hast.grovfoder.kgPerDag, 1),
                    type: t(hast.grovfoder.typ === 'ho' ? 'roughage.ho' : 'roughage.hosilage'),
                  })}
                </dd>
              </div>
              <div>
                <dt>{t('app.properties.analysis')}</dt>
                <dd>{analys ? analysText(analys) : t('app.properties.analysisNone')}</dd>
              </div>
            </dl>
          )}

          <nav className="flikar" aria-label={t('app.stepsNav')}>
            {STEG.map((id, i) => (
              <button
                key={id}
                className={steg === id ? 'vald' : ''}
                aria-current={steg === id ? 'page' : undefined}
                disabled={!tillganglig(id)}
                onClick={() => gaTill(id)}
              >
                <span className="flik-nr">{tal(i + 1, 0)}</span>
                {t(`steps.${id}`)}
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
              ('errors' in plan ? (
                <InvalidInput
                  errors={plan.errors}
                  onToHorse={() => gaTill('hast')}
                  onToAnalysis={() => gaTill('analys')}
                />
              ) : (
                <PlanStep
                  hast={hast}
                  analys={analys}
                  plan={plan.plan}
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
          <p className="fotnot">{t('app.footnote')}</p>
        </div>
      </div>
    </div>
  )
}
