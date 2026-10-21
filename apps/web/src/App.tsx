import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import produkterJson from './data/products.json'
import type { Grovfoderanalys, Hastprofil, Produkt } from '@fodr/domain/types'
import type { Omrakning } from '@fodr/domain/analysis'
import { skapaPlan } from '@fodr/domain/plan'
import { loadHorses, loadJournal, newJournalEntryId, nyHast, saveHorses, saveJournal } from './storage'
import { ogonblickAvPlan, nyPost, type Journalpost } from '@fodr/domain/journal'
import { hittaRas } from '@fodr/domain/breeds'
import { DEMO_ACCOUNT, currentUser, logIn, logOut, type User } from './auth'
import { formatDate, bodyConditionText, localIsoDate, formatNumber } from './format'
import { Login } from './components/Login'
import { LandingPage } from './components/LandingPage'
import { HorseStep } from './components/HorseStep'
import { AnalysisStep } from './components/AnalysisStep'
import { PlanStep } from './components/PlanStep'
import { InvalidInput } from './components/InvalidInput'
import { JournalStep } from './components/JournalStep'
import { Wordmark } from './components/Brand'

const produkter = produkterJson as Produkt[]
type Step = 'hast' | 'analys' | 'plan' | 'journal'

const STEPS: Step[] = ['hast', 'analys', 'plan', 'journal']

export default function App() {
  const { t } = useTranslation()
  const [user, setUser] = useState<User | null>(currentUser)
  const [visaStart, setVisaStart] = useState(() => !currentUser())
  const [visaLogin, setVisaLogin] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [visaStart])

  const oppna = (a: User) => {
    setUser(a)
    setVisaLogin(false)
    setVisaStart(false)
  }

  if (!user || visaStart) {
    return (
      <>
        <LandingPage
          produkter={produkter}
          loggedInAs={user?.namn ?? null}
          onDemo={() => oppna(user ?? logIn(DEMO_ACCOUNT.epost))}
          onLogIn={() => setVisaLogin(true)}
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
              <Login onLoggedIn={oppna} />
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <Workspace
      key={user.id}
      user={user}
      onToLanding={() => setVisaStart(true)}
      onLogOut={() => {
        logOut()
        setUser(null)
        setVisaStart(true)
      }}
    />
  )
}

/* Arbetsytan: sidofält med hästarna, varje häst som en egen sida med omslag, egenskaper och flikar. */
function Workspace({ user, onToLanding, onLogOut }: { user: User; onToLanding: () => void; onLogOut: () => void }) {
  const { t } = useTranslation()
  const [hastar, setHastar] = useState<Hastprofil[]>(() => loadHorses(user.id))
  const [valdId, setValdId] = useState(hastar[0]?.id)
  const [step, setStep] = useState<Step>('hast')
  const [analys, setAnalys] = useState<Grovfoderanalys | null>(null)
  const [omrakningar, setOmrakningar] = useState<Omrakning[]>([])
  const [journal, setJournal] = useState<Record<string, Journalpost[]>>(() => loadJournal(user.id))
  const [menyOppen, setMenyOppen] = useState(false)

  useEffect(() => saveHorses(user.id, hastar), [user.id, hastar])
  // Read again when the page is shown (a laptop opened the next morning), so the journal's default date and the
  // follow-up check move to the new day (#107). A page left visible across midnight keeps the old day until then.
  const [today, setToday] = useState(localIsoDate)
  useEffect(() => {
    const onShown = () => {
      if (document.visibilityState === 'visible') setToday(localIsoDate())
    }
    document.addEventListener('visibilitychange', onShown)
    return () => document.removeEventListener('visibilitychange', onShown)
  }, [])
  useEffect(() => saveJournal(user.id, journal), [user.id, journal])
  // Undefined for an account with no horses; hastar[0] alone is typed as always present (#17).
  const hast = hastar.find((h) => h.id === valdId) ?? (hastar.length > 0 ? hastar[0] : undefined)

  const plan = useMemo(
    () =>
      hast && analys
        ? skapaPlan({ ...hast, grovfoder: { ...hast.grovfoder, typ: analys.typ } }, analys, produkter)
        : null,
    [hast, analys],
  )

  function gaTill(s: Step) {
    setStep(s)
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

  const tillganglig = (s: Step) => (s === 'plan' ? Boolean(hast && analys) : s === 'hast' || Boolean(hast))
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
          <Wordmark />
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
            <span className="konto-ikon">{user.namn.slice(0, 1).toUpperCase()}</span>
            <span className="konto-text">
              <b>{user.namn}</b>
              <span>{user.epost}</span>
            </span>
          </div>
          <button className="sidofalt-lank" onClick={onToLanding}>
            {t('app.sidebar.toLanding')}
          </button>
          <button className="sidofalt-lank" onClick={onLogOut}>
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
                <dd>{t('app.properties.ageValue', { years: formatNumber(hast.alderAr, 1) })}</dd>
              </div>
              <div>
                <dt>{t('app.properties.breed')}</dt>
                <dd>{ras?.namn ?? t('app.properties.breedUnknown')}</dd>
              </div>
              <div>
                <dt>{t('app.properties.weight')}</dt>
                <dd>{t('units.kg', { value: formatNumber(hast.viktKg, 1) })}</dd>
              </div>
              <div>
                <dt>{t('app.properties.hull')}</dt>
                <dd>
                  {t('app.properties.hullValue', {
                    hull: formatNumber(hast.hull, 0),
                    text: bodyConditionText(hast.hull)?.toLowerCase() ?? '',
                  })}
                </dd>
              </div>
              <div>
                <dt>{t('app.properties.roughage')}</dt>
                <dd>
                  {t('app.properties.roughageValue', {
                    kg: formatNumber(hast.grovfoder.kgPerDag, 1),
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
            {STEPS.map((id, i) => (
              <button
                key={id}
                className={step === id ? 'vald' : ''}
                aria-current={step === id ? 'page' : undefined}
                disabled={!tillganglig(id)}
                onClick={() => gaTill(id)}
              >
                <span className="flik-nr">{formatNumber(i + 1, 0)}</span>
                {t(`steps.${id}`)}
              </button>
            ))}
          </nav>

          <main className="stegyta">
            {step === 'hast' && (
              <HorseStep
                selected={hast}
                produkter={produkter}
                onChange={uppdateraHast}
                onNew={laggTillHast}
                onNext={() => gaTill('analys')}
              />
            )}
            {step === 'analys' && hast && (
              <AnalysisStep
                hast={hast}
                analys={analys}
                omrakningar={omrakningar}
                onAnalysisChange={(a, o) => {
                  setAnalys(a)
                  setOmrakningar(o)
                }}
                onNext={() => gaTill('plan')}
              />
            )}
            {step === 'plan' &&
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
                  onSaveToJournal={() => {
                    // The plan is shown, so its snapshot exists.
                    if (planOgonblick)
                      laggTillPost(
                        hast.id,
                        nyPost(newJournalEntryId(), localIsoDate(), { text: '', plan: planOgonblick }),
                      )
                    gaTill('journal')
                  }}
                />
              ))}
            {step === 'journal' && hast && (
              <JournalStep
                hast={hast}
                poster={journal[hast.id] ?? []}
                aktuellPlan={planOgonblick}
                idag={today}
                onAdd={(post, uppdateraProfil) => {
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
