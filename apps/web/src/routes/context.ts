// What the route components share through React Router's outlet context: the session from Root, and the
// workspace state from Workspace for the step routes.
import { useOutletContext } from 'react-router'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import type { Omrakning } from '@fodr/domain/analysis'
import type { skapaPlan } from '@fodr/domain/plan'
import type { Journalpost, PlanOgonblick } from '@fodr/domain/journal'
import type { User } from '../auth'

export interface Session {
  user: User | null
  setUser: (user: User | null) => void
}

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
  omrakningar: Omrakning[]
  plan: ReturnType<typeof skapaPlan> | null
  planOgonblick: PlanOgonblick | null
  journal: Record<string, Journalpost[]>
  today: string
  goTo: (step: Step) => void
  setAnalysis: (analys: Grovfoderanalys | null, omrakningar: Omrakning[]) => void
  updateHorse: (horse: Hastprofil) => void
  addHorse: (horse: Hastprofil) => void
  addEntry: (horseId: string, entry: Journalpost) => void
}

export const useSession = () => useOutletContext<Session>()
export const useWorkspace = () => useOutletContext<WorkspaceContext>()
