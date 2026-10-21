import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import '../App.css'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import type { Omrakning } from '@fodr/domain/analysis'
import { skapaPlan } from '@fodr/domain/plan'
import { loadHorses, loadJournal, nyHast, saveHorses, saveJournal } from '../storage'
import { ogonblickAvPlan, type Journalpost } from '@fodr/domain/journal'
import { hittaRas } from '@fodr/domain/breeds'
import { logOut, type User } from '../auth'
import { breedName, formatDate, bodyConditionText, localIsoDate, formatNumber } from '../format'
import { Wordmark } from '../components/Brand'
import { produkter } from '../products'
import { STEP_PATH, STEPS, type Step, type WorkspaceContext } from './context'
import { useSession } from './session'

const STEP_OF_PATH = Object.fromEntries(STEPS.map((s) => [STEP_PATH[s], s])) as Record<string, Step>

/** /horses and below: a logged-out visitor goes to /login and comes back here after logging in. */
export function WorkspaceGate() {
  const session = useSession()
  const location = useLocation()
  if (!session.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Workspace key={session.user.id} user={session.user} setUser={session.setUser} />
}

/* Arbetsytan: sidofält med hästarna, varje häst som en egen sida med omslag, egenskaper och flikar. */
// The horse and step come from the URL, /horses/:horseId/<step>; the steps render in the Outlet (steps.tsx).
function Workspace({ user, setUser }: { user: User; setUser: (user: User | null) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const horseMatch = useMatch('/horses/:horseId/*')
  const stepMatch = useMatch('/horses/:horseId/:step')
  const [hastar, setHastar] = useState<Hastprofil[]>(() => loadHorses(user.id))
  const [analys, setAnalys] = useState<Grovfoderanalys | null>(null)
  const [omrakningar, setOmrakningar] = useState<Omrakning[]>([])
  const [journal, setJournal] = useState<Record<string, Journalpost[]>>(() => loadJournal(user.id))
  const [menyOppen, setMenyOppen] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])
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
  const horseId = horseMatch?.params.horseId
  const hast = horseId === undefined ? undefined : hastar.find((h) => h.id === horseId)
  // An account with no horses has only the profile step, at /horses.
  const step: Step = (stepMatch?.params.step && STEP_OF_PATH[stepMatch.params.step]) || 'hast'

  const plan = useMemo(
    () =>
      hast && analys
        ? skapaPlan({ ...hast, grovfoder: { ...hast.grovfoder, typ: analys.typ } }, analys, produkter)
        : null,
    [hast, analys],
  )

  // Choosing a horse keeps the step, as it did before the steps had URLs. flushSync renders the new step during the
  // click, as the state change did: in a transition the old step stays on screen a moment and takes the next input.
  const open = (id: string, s: Step, replace = false) => {
    void navigate(`/horses/${id}/${STEP_PATH[s]}`, { flushSync: true, replace })
    window.scrollTo({ top: 0 })
  }
  const goTo = (s: Step) => {
    if (hast) open(hast.id, s)
  }
  const selectHorse = (id: string) => {
    open(id, step)
    setMenyOppen(false)
  }
  const updateHorse = (h: Hastprofil) => setHastar((alla) => alla.map((x) => (x.id === h.id ? h : x)))
  const addHorse = (h: Hastprofil) => {
    setHastar((alla) => [...alla, h])
    // The first horse replaces /horses, which would only send back to it.
    open(h.id, 'hast', horseId === undefined)
    setMenyOppen(false)
  }
  const addEntry = (hastId: string, post: Journalpost) =>
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

  // A link to a horse this account does not have lands on the first horse.
  if (horseId !== undefined && !hast) return <Navigate to="/horses" replace />

  const context: WorkspaceContext = {
    hastar,
    hast,
    analys,
    omrakningar,
    plan,
    planOgonblick,
    journal,
    today,
    goTo,
    setAnalysis: (a, o) => {
      setAnalys(a)
      setOmrakningar(o)
    },
    updateHorse,
    addHorse,
    addEntry,
  }

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
                onClick={() => selectHorse(h.id)}
              >
                <span className="hast-ikon">{initial(h)}</span>
                <span className="hastrad-namn">{h.namn || t('app.sidebar.unnamedHorse')}</span>
              </button>
            </li>
          ))}
          <li>
            <button className="hastrad ny" onClick={() => addHorse(nyHast())}>
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
          <button className="sidofalt-lank" onClick={() => void navigate('/')}>
            {t('app.sidebar.toLanding')}
          </button>
          <button
            className="sidofalt-lank"
            onClick={() => {
              logOut()
              // The landing page renders first, so the gate never sees the session end and sends to /login.
              void navigate('/', { flushSync: true })
              setUser(null)
            }}
          >
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
                <dd>{ras ? breedName(ras.id) : t('app.properties.breedUnknown')}</dd>
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
                onClick={() => goTo(id)}
              >
                <span className="flik-nr">{formatNumber(i + 1, 0)}</span>
                {t(`steps.${id}`)}
              </button>
            ))}
          </nav>

          <main className="stegyta">
            <Outlet context={context} />
          </main>
          <p className="fotnot">{t('app.footnote')}</p>
        </div>
      </div>
    </div>
  )
}
