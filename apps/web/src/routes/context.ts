// What the step routes share through React Router's outlet context: the workspace state from Workspace.
import { useOutletContext } from 'react-router'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import type { skapaPlan } from '@fodr/domain/plan'
import type { Journalpost, PlanOgonblick } from '@fodr/domain/journal'
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
  planOgonblick: PlanOgonblick | null
  /** The catalogue from the API (#27). */
  produkter: Produkt[]
  journal: Record<string, Journalpost[]>
  today: string
  goTo: (step: Step) => void
  updateHorse: (horse: Hastprofil) => void
  /** Creates a horse and opens its profile. */
  addHorse: () => void
  /** Deletes the horse; rejects when the server refused, so the confirmation can say so. */
  removeHorse: (id: string) => Promise<void>
  addEntry: (horseId: string, entry: Journalpost) => void
}

export const useWorkspace = () => useOutletContext<WorkspaceContext>()
