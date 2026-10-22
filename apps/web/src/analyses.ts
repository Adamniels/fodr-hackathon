// Each horse's current analysis on the API (#26, CF4), read with TanStack Query (ADR 0012) per horse, so switching
// horse shows that horse's own analysis (audit C4). A report is uploaded to the API, which reads it with the AI and
// stores it; corrections are saved by an AutoSaver once the typing pauses, and only when the domain accepts every
// value (an invalid correction stays on the page with its message and is never sent). As with the horses, the cached
// analyses are dropped when the workspace closes.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  ANALYSIS_FILE_LIMITS,
  ANALYSIS_MEDIA_TYPES,
  AnalysisSchema,
  CurrentAnalysisSchema,
  type Analysis,
  type AnalysisMediaType,
  type Values,
} from '@fodr/contracts/analyses'
import type { Omrakning } from '@fodr/domain/analysis'
import type { Grovfoderanalys } from '@fodr/domain/types'
import { validateAnalysis } from '@fodr/domain/validation'
import { callApi, refusedByServer, sessionGuard } from './api-v1'
import { AutoSaver, type SaveState } from './autosave'

/** Why a report cannot be uploaded, checked in the browser before any request (CF4); the API checks again. */
export type ReportProblem = 'analysis.unsupported_type' | 'analysis.too_large'

export function reportProblem(file: File): ReportProblem | undefined {
  if (!(ANALYSIS_MEDIA_TYPES as string[]).includes(file.type)) return 'analysis.unsupported_type'
  return file.size > ANALYSIS_FILE_LIMITS[file.type as AnalysisMediaType] ? 'analysis.too_large' : undefined
}

/** An analysis as the steps use it. */
export interface StoredAnalysis {
  /** The server's ID, which a saved plan refers to. */
  id: string
  analys: Grovfoderanalys
  omrakningar: Omrakning[]
  /** The AI's notes on what it was unsure of; empty for an example. */
  anmarkningar: string[]
}

/** Where the corrections are; `invalid` while a value the domain refuses keeps them from being sent. */
export type AnalysisSaveState = SaveState | 'invalid'

/** What the steps need of the current horse's analysis. */
export interface AnalysisStore {
  /** Undefined while it loads, null when the horse has none (or it could not be read: see loadFailed). */
  current: StoredAnalysis | null | undefined
  loadFailed: boolean
  reload: () => void
  /** Reads and stores the report; rejects with an ApiError when it cannot. */
  upload: (file: File) => Promise<void>
  correct: (analys: Grovfoderanalys, omrakningar: Omrakning[]) => void
  saveState: AnalysisSaveState | undefined
  retrySave: () => void
  /** Sends every waiting correction, before saving a plan. */
  flush: () => Promise<void>
  /** Whether a correction is waiting, on its way, failed, or held back as invalid. */
  hasUnsaved: () => boolean
}

const base = (horseId: string) => `/horses/${horseId}/analyses`

export const analysesApi = {
  current: async (horseId: string): Promise<Analysis | null> =>
    CurrentAnalysisSchema.parse(await (await callApi(`${base(horseId)}/current`)).json()).analysis,
  upload: async (horseId: string, file: File): Promise<Analysis> => {
    const form = new FormData()
    form.set('file', file)
    return AnalysisSchema.parse(await (await callApi(base(horseId), { method: 'POST', body: form })).json())
  },
  // keepalive lets the request outlive the page, for the save sent when the page is left.
  updateValues: async (horseId: string, analysisId: string, values: Values, keepalive = false): Promise<void> => {
    await callApi(`${base(horseId)}/${analysisId}/values`, { method: 'PUT', body: JSON.stringify(values), keepalive })
  },
}

/** The query key of every account's analyses, removed when the workspace closes or the user logs out. */
export const ANALYSES_QUERY_KEY = ['analysis']
const analysisKey = (userId: string, horseId: string) => [...ANALYSES_QUERY_KEY, userId, horseId]

// The saves a closed workspace sent on its way, per user, as in horses.ts: a workspace opened again reads after them.
const closing = new Map<string, Promise<void>>()

/** Corrections waiting to be saved: the analysis's ID is the AutoSaver's key. */
interface Correction {
  id: string
  horseId: string
  values: Values
}

export function useApiAnalysis(userId: string, horseId: string | undefined): AnalysisStore {
  const queryClient = useQueryClient()
  const guard = sessionGuard(queryClient)
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const [invalid, setInvalid] = useState<Record<string, boolean>>({})
  const [saver] = useState(
    () =>
      new AutoSaver<Correction>(
        (c, keepalive) => guard(analysesApi.updateValues(c.horseId, c.id, c.values, keepalive)),
        (id, state) => setStates((s) => ({ ...s, [id]: state })),
        600,
        refusedByServer,
      ),
  )
  const key = analysisKey(userId, horseId ?? '')
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      await closing.get(userId)
      // enabled only with a horse.
      const analysis = await guard(analysesApi.current(horseId ?? ''))
      // A correction begun while this read was on its way is newer than what it brings: the page's copy stays.
      return saver.busy() ? (queryClient.getQueryData<Analysis | null>(key) ?? analysis) : analysis
    },
    enabled: horseId !== undefined,
    // As for the horses: read again on focus or reconnect only while every correction is saved, stale at once so the
    // reads run.
    staleTime: 0,
    refetchOnWindowFocus: () => !saver.busy(),
    refetchOnReconnect: () => !saver.busy(),
    retry: false,
  })

  // Whether the workspace has closed (the landing page, logging out): an upload answered after that is not put back in
  // the cache, which closing emptied.
  const closed = useRef(false)

  useEffect(() => {
    closed.current = false
    const onPageHide = () => saver.flushOnExit()
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.busy()) e.preventDefault()
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      closed.current = true
      closing.set(userId, saver.flush())
      queryClient.removeQueries({ queryKey: [...ANALYSES_QUERY_KEY, userId] })
    }
  }, [saver, userId, queryClient])

  const current = horseId === undefined ? null : query.isPending ? undefined : (query.data ?? null)
  const store = (analysis: Analysis) => {
    if (horseId !== undefined && !closed.current) queryClient.setQueryData(analysisKey(userId, horseId), analysis)
  }

  return {
    current,
    loadFailed: query.isError,
    reload: () => void query.refetch(),
    upload: async (file) => {
      if (horseId !== undefined) store(await guard(analysesApi.upload(horseId, file)))
    },
    correct: (analys, omrakningar) => {
      const analysis = query.data
      if (!analysis || horseId === undefined) return
      store({ ...analysis, analys, omrakningar })
      const refused = validateAnalysis(analys).length > 0
      setInvalid((s) => ({ ...s, [analysis.id]: refused }))
      if (refused) saver.discard(analysis.id)
      else saver.schedule({ id: analysis.id, horseId, values: { analys, omrakningar } })
    },
    saveState: query.data ? (invalid[query.data.id] ? 'invalid' : states[query.data.id]) : undefined,
    retrySave: () => {
      if (query.data) saver.retry(query.data.id)
    },
    flush: () => saver.flush(),
    hasUnsaved: () => saver.busy() || (query.data ? validateAnalysis(query.data.analys).length > 0 : false),
  }
}
