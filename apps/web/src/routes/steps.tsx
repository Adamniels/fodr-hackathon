// The workspace steps, one route each under /horses/:horseId (router.tsx). Each reads the workspace state from the
// outlet context and renders the step component as App.tsx did before the steps had URLs (#21).
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { HorseStep } from '../components/HorseStep'
import { AnalysisStep } from '../components/AnalysisStep'
import { PlanStep } from '../components/PlanStep'
import { InvalidInput } from '../components/InvalidInput'
import { JournalStep } from '../components/JournalStep'
import { STEP_PATH, useWorkspace } from './context'

/** /horses: the first horse's profile, or the empty profile step for an account with no horses. */
export function HorsesIndex() {
  const { hastar } = useWorkspace()
  if (hastar.length > 0) return <Navigate to={`/horses/${hastar[0].id}/${STEP_PATH.hast}`} replace />
  return <ProfileRoute />
}

export function ProfileRoute() {
  const { hast, produkter, updateHorse, addHorse, removeHorse, goTo } = useWorkspace()
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
  if (!hast) return null
  // Keyed by horse, so an upload's message or a draft value never carries over to another horse.
  return <AnalysisStep key={hast.id} hast={hast} analyses={analyses} onNext={() => goTo('plan')} />
}

export function PlanRoute() {
  const { t } = useTranslation()
  const { hast, analys, analyses, plan, savedPlan, savePlan, goTo } = useWorkspace()
  if (!hast) return null
  // Wait for the horse's analysis; without one, the plan has nothing to plan from: back to the analysis.
  if (analyses.current === undefined) return <p role="status">{t('analysis.loading')}</p>
  if (!analys || !plan) return <Navigate to={`/horses/${hast.id}/${STEP_PATH.analys}`} replace />
  if ('errors' in plan) {
    return <InvalidInput errors={plan.errors} onToHorse={() => goTo('hast')} onToAnalysis={() => goTo('analys')} />
  }
  return (
    <PlanStep
      hast={hast}
      analys={analys}
      plan={plan.plan}
      savedAt={savedPlan?.createdAt}
      onSaveToJournal={async () => {
        await savePlan()
        goTo('journal')
      }}
    />
  )
}

export function JournalRoute() {
  const { hast, journal, planOgonblick, today, addEntry, updateHorse } = useWorkspace()
  if (!hast) return null
  return (
    <JournalStep
      hast={hast}
      poster={journal[hast.id] ?? []}
      aktuellPlan={planOgonblick}
      idag={today}
      onAdd={(post, uppdateraProfil) => {
        addEntry(hast.id, post)
        if (uppdateraProfil) {
          updateHorse({ ...hast, viktKg: post.viktKg ?? hast.viktKg, hull: post.hull ?? hast.hull })
        }
      }}
    />
  )
}
