// The workspace steps, one route each under /horses/:horseId (router.tsx). Each reads the workspace state from the
// outlet context and renders the step component as App.tsx did before the steps had URLs (#21).
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { HorseStep } from '../components/HorseStep'
import { AnalysisStep } from '../components/AnalysisStep'
import { PlanStep } from '../components/PlanStep'
import { InvalidInput } from '../components/InvalidInput'
import { JournalStep } from '../components/JournalStep'
import { usePageTitle } from '../page-title'
import { STEP_PATH, useWorkspace } from './context'

/** The tab's title for a horse's step: the step's heading, with the horse's name, or a word for it without one. */
function useStepTitle(key: 'horse.title' | 'analysis.title' | 'plan.title' | 'journal.title') {
  const { t } = useTranslation()
  const { hast } = useWorkspace()
  usePageTitle(hast ? t(key, { name: hast.namn || t('common.theHorse') }) : t('app.newHorse'))
}

/** /horses: the first horse's profile, or the empty profile step for an account with no horses. */
export function HorsesIndex() {
  const { hastar } = useWorkspace()
  if (hastar.length > 0) return <Navigate to={`/horses/${hastar[0].id}/${STEP_PATH.hast}`} replace />
  return <ProfileRoute />
}

export function ProfileRoute() {
  const { hast, produkter, updateHorse, addHorse, removeHorse, goTo } = useWorkspace()
  useStepTitle('horse.title')
  return (
    <HorseStep
      selected={hast}
      produkter={produkter}
      onChange={updateHorse}
      onNew={addHorse}
      onDelete={removeHorse}
      onNext={() => goTo('analys')}
    />
  )
}

export function AnalysisRoute() {
  const { hast, analyses, goTo } = useWorkspace()
  useStepTitle('analysis.title')
  if (!hast) return null
  // Keyed by horse, so an upload's message or a draft value never carries over to another horse.
  return <AnalysisStep key={hast.id} hast={hast} analyses={analyses} onNext={() => goTo('plan')} />
}

export function PlanRoute() {
  const { t } = useTranslation()
  const {
    hast,
    analys,
    analyses,
    plan,
    savedPlan,
    savePlan,
    planSaveError,
    planInJournal,
    userId,
    produkter,
    catalogueFailed,
    reloadCatalogue,
    goTo,
  } = useWorkspace()
  useStepTitle('plan.title')
  if (!hast) return null
  if (!produkter) {
    return catalogueFailed ? (
      <div className="ruta fel" role="alert">
        {t('app.catalogue.loadFailed')}{' '}
        <button className="lank" onClick={reloadCatalogue}>
          {t('app.catalogue.retry')}
        </button>
      </div>
    ) : (
      <p role="status">{t('app.catalogue.loading')}</p>
    )
  }
  // Wait for the horse's analysis; without one, the plan has nothing to plan from: back to the analysis.
  if (analyses.current === undefined) return <p role="status">{t('analysis.loading')}</p>
  if (!analys || !plan) return <Navigate to={`/horses/${hast.id}/${STEP_PATH.analys}`} replace />
  if ('errors' in plan) {
    return <InvalidInput errors={plan.errors} onToHorse={() => goTo('hast')} onToAnalysis={() => goTo('analys')} />
  }
  // Keyed on the horse: a rewrite of one horse's explanation, failed or under way, is not another horse's (#32).
  return (
    <PlanStep
      key={hast.id}
      hast={hast}
      analys={analys}
      plan={plan.plan}
      userId={userId}
      planId={savedPlan?.id}
      inJournalOn={planInJournal}
      planSaveError={planSaveError}
      onSaveToJournal={async () => {
        await savePlan()
        goTo('journal')
      }}
    />
  )
}

export function JournalRoute() {
  const { t } = useTranslation()
  const { hast, journal, planOgonblick, today } = useWorkspace()
  useStepTitle('journal.title')
  if (!hast) return null
  if (journal.loadFailed) {
    return (
      <div className="ruta fel" role="alert">
        {t('journal.loadFailed')}{' '}
        <button className="lank" onClick={journal.reload}>
          {t('journal.retry')}
        </button>
      </div>
    )
  }
  if (!journal.entries) return <p role="status">{t('journal.loading')}</p>
  // The store adds the entry, and with "Uppdatera profilen" its measurements to the profile (on the server for an
  // account, #28), after which the plan is calculated again.
  return (
    <JournalStep hast={hast} poster={journal.entries} aktuellPlan={planOgonblick} idag={today} onAdd={journal.add} />
  )
}
