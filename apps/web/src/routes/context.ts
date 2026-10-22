// What the step routes share through React Router's outlet context: the workspace state from Workspace.
import { useOutletContext } from 'react-router'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import type { skapaPlan } from '@fodr/domain/plan'
import type { PlanOgonblick } from '@fodr/domain/journal'
import type { JournalStore } from '../journal'
import type { AnalysisStore } from '../analyses'
import type { SavedPlan } from '@fodr/contracts/plans'
import type { Produkt } from '@fodr/domain/types'

/** The workspace's steps, as the state names them. */
export type Step = 'hast' | 'analys' | 'plan' | 'journal'

export const STEPS: Step[] = ['hast', 'analys', 'plan', 'journal']

/** Each step's path segment in the URL, /horses/:horseId/<segment>. */
export const STEP_PATH: Record<Step, string> = { hast: 'profile', analys: 'analysis', plan: 'plan', journal: 'journal' }

export interface WorkspaceContext {
  hastar: Hastprofil[]
  /** The horse in the URL; undefined only for an account with no horses (/horses). */
  hast: Hastprofil | undefined
  analys: Grovfoderanalys | null
  /** The current horse's analysis and what can be done with it (#26). */
  analyses: AnalysisStore
  plan: ReturnType<typeof skapaPlan> | null
  /** The saved plan on screen: the horse's latest, when computed from exactly these inputs (#27). */
  savedPlan: SavedPlan | null
  /** Saves the plan on screen (on the server for an account) and adds its snapshot to the journal. */
  savePlan: () => Promise<void>
  /** Why the plan on screen could not be saved when the plan step showed it (#32), or null. */
  planSaveError: unknown
  /** The signed-in user, whose caches the steps' queries belong to. */
  userId: string
  planOgonblick: PlanOgonblick | null
  /** The catalogue from the API (#27); undefined while it loads, which only the plan and the feed list wait for. */
  produkter: Produkt[] | undefined
  catalogueFailed: boolean
  reloadCatalogue: () => void
  /** The current horse's journal (#28). */
  journal: JournalStore
  today: string
  goTo: (step: Step) => void
  updateHorse: (horse: Hastprofil) => void
  /** Creates a horse and opens its profile. */
  addHorse: () => void
  /** Deletes the horse; rejects when the server refused, so the confirmation can say so. */
  removeHorse: (id: string) => Promise<void>
}

export const useWorkspace = () => useOutletContext<WorkspaceContext>()
