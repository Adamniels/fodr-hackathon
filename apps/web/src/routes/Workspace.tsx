import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import '../App.css'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import type { SavedPlan } from '@fodr/contracts/plans'
import { skapaPlan } from '@fodr/domain/plan'
import { loadJournal, newJournalEntryId, saveJournal } from '../storage'
import { useApiHorses, type HorseStore } from '../horses'
import { useApiAnalysis, type AnalysisStore } from '../analyses'
import { SaveStatus } from '../components/SaveStatus'
import { DEMO_USER, useDemoAnalysis, useDemoHorses } from '../demo'
import { nyPost, ogonblickAvPlan, type Journalpost } from '@fodr/domain/journal'
import { hittaRas } from '@fodr/domain/breeds'
import type { User } from '@fodr/contracts/me'
import { breedName, formatDate, bodyConditionText, localIsoDate, formatNumber } from '../format'
import { Wordmark } from '../components/Brand'
import { useCatalogue } from '../products'
import { isSavedFor, PlanSaveError, useSavedPlans } from '../plans'
import { STEP_PATH, STEPS, type Step, type WorkspaceContext } from './context'
import { useSession } from './session'

const STEP_OF_PATH = Object.fromEntries(STEPS.map((s) => [STEP_PATH[s], s])) as Record<string, Step>

/** /horses and below: a logged-out visitor goes to /login and comes back here after logging in. */
export function WorkspaceGate() {
  const session = useSession()
  const location = useLocation()
  if (!session.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return session.user.id === DEMO_USER.id ? (
    <DemoWorkspace key={session.user.id} user={session.user} logOut={session.logOut} />
  ) : (
    <AccountWorkspace key={session.user.id} user={session.user} logOut={session.logOut} />
  )
}

interface WorkspaceProps {
  user: User
  logOut: () => Promise<void>
}

/** The horse in the URL, whose analysis the workspace shows. */
const useHorseIdInUrl = () => useMatch('/horses/:horseId/*')?.params.horseId

/** The browser-only demo's workspace, its horses in localStorage and analyses in memory until #29. */
function DemoWorkspace(props: WorkspaceProps) {
  const horses = useDemoHorses()
  const analyses = useDemoAnalysis(useHorseIdInUrl())
  // The demo has no server: its plans are saved in its browser journal only.
  return <Workspace {...props} horses={horses} analyses={analyses} savedPlans={null} />
}

/** Saving plans on the server (#27); null for the demo. */
type SavedPlans = ReturnType<typeof useSavedPlans> | null

/** An account's workspace, its horses (#25) and analyses (#26) on the API. It opens once the horses are read. */
function AccountWorkspace(props: WorkspaceProps) {
  const { t } = useTranslation()
  const { store, reload } = useApiHorses(props.user.id)
  // Only a horse of the account: another ID in the URL is sent to /horses by the workspace, never read.
  const urlHorseId = useHorseIdInUrl()
  const knownHorseId = store?.horses.some((h) => h.id === urlHorseId) ? urlHorseId : undefined
  const analyses = useApiAnalysis(props.user.id, knownHorseId)
  const savedPlans = useSavedPlans(props.user.id, knownHorseId)
  if (store === undefined) {
    return (
      <p className="arbetsyta-laddar" role="status">
        {t('app.horses.loading')}
      </p>
    )
  }
  if (store === null) {
    return (
      <div className="arbetsyta-laddar">
        <p className="ruta fel" role="alert">
          {t('app.horses.loadFailed')}
        </p>
        <button className="knapp" onClick={reload}>
          {t('app.horses.retry')}
        </button>
      </div>
    )
  }
  return <Workspace {...props} horses={store} analyses={analyses} savedPlans={savedPlans} />
}

/* Arbetsytan: sidofält med hästarna, varje häst som en egen sida med omslag, egenskaper och flikar. */
// The horse and step come from the URL, /horses/:horseId/<step>; the steps render in the Outlet (steps.tsx).
function Workspace({
  user,
  logOut,
  horses,
  analyses,
  savedPlans,
}: WorkspaceProps & { horses: HorseStore; analyses: AnalysisStore; savedPlans: SavedPlans }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const horseMatch = useMatch('/horses/:horseId/*')
  const stepMatch = useMatch('/horses/:horseId/:step')
  const hastar = horses.horses
  // The current horse's own analysis (C4), undefined while it loads.
  const analys = analyses.current?.analys ?? null
  const [journal, setJournal] = useState<Record<string, Journalpost[]>>(() => loadJournal(user.id))
  const [menyOppen, setMenyOppen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addFailed, setAddFailed] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])
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

  // The catalogue from the API (#27): the preview plans with the one the server saves plans with.
  const catalogue = useCatalogue()
  const produkter = catalogue.data?.products
  const preview = useMemo(
    () => (hast && analys && produkter ? skapaPlan(hast, analys, produkter) : null),
    [hast, analys, produkter],
  )
  // The horse's latest saved plan, when it was computed from what is on screen: the page then shows the server's plan
  // (ADR 0004), marked as saved.
  const savedPlan: SavedPlan | null =
    savedPlans &&
    hast &&
    analys &&
    catalogue.data &&
    isSavedFor(savedPlans.latest, hast, analys, catalogue.data.version)
      ? savedPlans.latest
      : null
  const plan = savedPlan ? { plan: savedPlan.result } : preview

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
  const updateHorse = horses.update
  const addHorse = async () => {
    if (adding) return
    setAdding(true)
    setAddFailed(false)
    try {
      const h = await horses.create()
      // The first horse replaces /horses, which would only send back to it.
      open(h.id, 'hast', horseId === undefined)
      setMenyOppen(false)
    } catch {
      setAddFailed(true)
    } finally {
      setAdding(false)
    }
  }
  // The deleted horse leaves the list, and its URL then sends to /horses (below). Its journal is kept in the browser
  // until #28, so it is removed here; its analyses and saved plans go with it on the server (#26, #27).
  // Focus moves to the page title, as the dialog that held it goes away with the profile.
  const removeHorse = async (id: string) => {
    await horses.remove(id)
    setJournal((j) => Object.fromEntries(Object.entries(j).filter(([hastId]) => hastId !== id)))
    requestAnimationFrame(() => title.current?.focus())
  }
  const addEntry = (hastId: string, post: Journalpost) =>
    setJournal((j) => ({ ...j, [hastId]: [...(j[hastId] ?? []), post] }))
  const planOgonblick = plan && 'plan' in plan && analys ? ogonblickAvPlan(plan.plan, analys) : null
  // Saving: the server computes and stores the plan, and the journal entry is a snapshot of what it computed, with
  // its ID (#27). The demo, without a server, snapshots its preview. Rejects when the server refused, for the plan step
  // to say so.
  const savePlan = async () => {
    if (!hast || !analys || !plan || !('plan' in plan)) return
    if (!savedPlans) {
      addEntry(
        hast.id,
        nyPost(newJournalEntryId(), localIsoDate(), { text: '', plan: ogonblickAvPlan(plan.plan, analys) }),
      )
      return
    }
    // The server plans from what it holds: the edits still on their way go first, and an edit it does not have
    // (failed, refused, invalid) stops the save rather than saving another plan than the one on screen.
    await Promise.all([horses.flush(), analyses.flush()])
    if (horses.hasUnsaved() || analyses.hasUnsaved()) throw new PlanSaveError('unsaved')
    const analysisId = analyses.current?.id
    if (!analysisId) throw new Error('An account analysis has no ID')
    // A catalogue changed by a deploy since the page loaded: revalidated by its version, so the server's is used.
    const { data: current } = await catalogue.refetch()
    const saved = await savedPlans.save(analysisId)
    addEntry(
      hast.id,
      nyPost(newJournalEntryId(), localIsoDate(), {
        text: '',
        plan: ogonblickAvPlan(saved.result, saved.inputs.analys, saved.id),
      }),
    )
    if (!current || !isSavedFor(saved, hast, analys, current.version)) throw new PlanSaveError('differs')
  }

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
    analyses,
    plan,
    savedPlan,
    savePlan,
    planOgonblick,
    produkter,
    catalogueFailed: catalogue.isError,
    reloadCatalogue: () => void catalogue.refetch(),
    journal,
    today,
    goTo,
    updateHorse,
    addHorse: () => void addHorse(),
    removeHorse,
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
            <button className="hastrad ny" disabled={adding} onClick={() => void addHorse()}>
              <span className="hast-ikon">+</span>
              <span className="hastrad-namn">{t('app.sidebar.addHorse')}</span>
            </button>
          </li>
        </ul>

        <div className="sidofalt-fot">
          <div className="konto">
            <span className="konto-ikon">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="konto-text">
              <b>{user.name}</b>
              <span>{user.email}</span>
            </span>
          </div>
          <button className="sidofalt-lank" onClick={() => void navigate('/')}>
            {t('app.sidebar.toLanding')}
          </button>
          <button
            className="sidofalt-lank"
            onClick={() => {
              // Edits still waiting are sent before the session ends, which would refuse them.
              const saved = horses.flush()
              // The landing page renders first, so the gate never sees the session end and sends to /login.
              void navigate('/', { flushSync: true })
              void saved.then(logOut)
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
          <h1 className="sid-titel" ref={title} tabIndex={-1}>
            {hast?.namn || t('app.newHorse')}
          </h1>
          {/* In the page rather than the sidebar, which is closed on a phone when the welcome card adds the horse. */}
          {addFailed && (
            <p className="ruta fel" role="alert">
              {t('app.horses.addFailed')}
            </p>
          )}
          {hast && <SaveStatus state={horses.saveState(hast.id)} onRetry={() => horses.retrySave(hast.id)} />}

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
