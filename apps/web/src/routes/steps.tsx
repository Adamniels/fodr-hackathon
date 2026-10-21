// The workspace steps, one route each under /horses/:horseId (router.tsx). Each reads the workspace state from the
// outlet context and renders the step component as App.tsx did before the steps had URLs (#21).
import { Navigate } from 'react-router'
import { nyPost } from '@fodr/domain/journal'
import { newJournalEntryId } from '../storage'
import { localIsoDate } from '../format'
import { produkter } from '../products'
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
  const { hast, updateHorse, addHorse, goTo } = useWorkspace()
  return (
    <HorseStep
      selected={hast}
      produkter={produkter}
      onChange={updateHorse}
      onNew={addHorse}
      onNext={() => goTo('analys')}
    />
  )
}

export function AnalysisRoute() {
  const { hast, analys, omrakningar, setAnalysis, goTo } = useWorkspace()
  if (!hast) return null
  return (
    <AnalysisStep
      hast={hast}
      analys={analys}
      omrakningar={omrakningar}
      onAnalysisChange={setAnalysis}
      onNext={() => goTo('plan')}
    />
  )
}

export function PlanRoute() {
  const { hast, analys, plan, planOgonblick, addEntry, goTo } = useWorkspace()
  if (!hast) return null
  // The analysis is not stored (#26), so after a reload the plan has nothing to plan from: back to the analysis.
  if (!analys || !plan) return <Navigate to={`/horses/${hast.id}/${STEP_PATH.analys}`} replace />
  if ('errors' in plan) {
    return <InvalidInput errors={plan.errors} onToHorse={() => goTo('hast')} onToAnalysis={() => goTo('analys')} />
  }
  return (
    <PlanStep
      hast={hast}
      analys={analys}
      plan={plan.plan}
      onSaveToJournal={() => {
        // The plan is shown, so its snapshot exists.
        if (planOgonblick)
          addEntry(hast.id, nyPost(newJournalEntryId(), localIsoDate(), { text: '', plan: planOgonblick }))
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
