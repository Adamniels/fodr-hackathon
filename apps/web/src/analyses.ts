// Each horse's current analysis on the API (#26, CF4), read with TanStack Query (ADR 0012) per horse, so switching
// horse shows that horse's own analysis (audit C4). A report is uploaded to the API, which reads it with the AI and
// stores it; values typed in by hand (#145) are stored the same way, without a report. Corrections are saved by an
// AutoSaver once the typing pauses, and only when the domain accepts every value (an invalid correction stays on the
// page with its message and is never sent). As with the horses, the cached analyses are dropped when the workspace
// closes.
//
// A correction names the version of the server's copy it was based on (#140, ADR 0017). As for the horses, each
// analysis's version is kept beside the cache, not read from it: a correction can still be on its way after the
// workspace closed and emptied the cache (#140 review). It moves only when the page takes the server's copy (a read, an
// upload, a correction's answer). A correction refused because the server's copy moved on is a conflict: the page reads
// the current analysis, and the user takes it or keeps their own.
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
import { ifMatch } from '@fodr/contracts/version'
import { ApiError, callApi, changedOnServer, refusedByServer, sessionGuard } from './api-v1'
import { changedFields } from './changes'
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
  /** The AI's notes on what it was unsure of; empty for an analysis without a report. */
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
  /** Stores values typed in by hand, with no report, as the current analysis (#145); rejects as upload does. */
  enter: (analys: Grovfoderanalys) => Promise<void>
  correct: (analys: Grovfoderanalys, omrakningar: Omrakning[]) => void
  saveState: AnalysisSaveState | undefined
  retrySave: () => void
  /** Sends every waiting correction, before saving a plan or logging out (with keepalive, #169). */
  flush: (keepalive?: boolean) => Promise<void>
  /** Whether a correction is waiting, on its way, failed, or held back as invalid. */
  hasUnsaved: () => boolean
  /**
   * While a correction is refused as based on an older copy (#140): the server's current analysis, and whether the
   * page's corrections can still be saved over it (not when it is another analysis, a report read since).
   */
  conflict: { analys: Grovfoderanalys; canKeepMine: boolean } | undefined
  /** Takes the server's current analysis into the page, giving up the corrections. */
  takeTheirs: () => void
  /** Saves the page's corrections over the server's, now that the user has seen it. */
  keepMine: () => void
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
  create: async (horseId: string, analys: Grovfoderanalys): Promise<Analysis> =>
    AnalysisSchema.parse(
      await (await callApi(base(horseId), { method: 'POST', body: JSON.stringify({ analys }) })).json(),
    ),
  // The correction of the copy read at `version`; keepalive lets the request outlive the page, for the save sent when
  // the page is left.
  updateValues: async (
    horseId: string,
    analysisId: string,
    values: Values,
    version: number,
    keepalive = false,
  ): Promise<Analysis> =>
    AnalysisSchema.parse(
      await (
        await callApi(`${base(horseId)}/${analysisId}/values`, {
          method: 'PUT',
          body: JSON.stringify(values),
          headers: ifMatch(version),
          keepalive,
        })
      ).json(),
    ),
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
  // The server's current analysis, per analysis whose correction it refused as based on an older copy.
  const [conflicts, setConflicts] = useState<Partial<Record<string, Analysis>>>({})
  // The version of the server's copy each analysis was read at.
  const [versions] = useState(() => new Map<string, number>())
  const known = <A extends Analysis | null>(analysis: A): A => {
    if (analysis) versions.set(analysis.id, analysis.version)
    return analysis
  }
  const [saver] = useState(
    () =>
      new AutoSaver<Correction>(
        async (c, keepalive) => {
          // Every analysis came from the server with its version; one without would be saved over blindly.
          const version = versions.get(c.id)
          if (version === undefined) throw new Error(`no version of analysis ${c.id}`)
          try {
            const saved = await guard(analysesApi.updateValues(c.horseId, c.id, c.values, version, keepalive))
            versions.set(c.id, saved.version)
          } catch (e) {
            if (!changedOnServer(e)) throw e
            // The server's copy moved on: read it for the user's choice. A read that fails, or finds no analysis,
            // leaves a plain failure, whose retry meets the conflict again.
            const theirs = await guard(analysesApi.current(c.horseId))
            // Gone on the other device: as the server says of an analysis it cannot find.
            if (!theirs) throw new ApiError(404, 'analysis.not_found')
            // The same correction made on the other device: the server holds what this one sends, so it is saved.
            if (theirs.id === c.id && changedFields(c.values.analys, theirs.analys).length === 0) {
              versions.set(c.id, theirs.version)
              return
            }
            setConflicts((s) => ({ ...s, [c.id]: theirs }))
            throw e
          }
        },
        (id, state) => setStates((s) => ({ ...s, [id]: state })),
        600,
        refusedByServer,
        changedOnServer,
      ),
  )
  const key = analysisKey(userId, horseId ?? '')
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      await closing.get(userId)
      // enabled only with a horse.
      const analysis = await guard(analysesApi.current(horseId ?? ''))
      const cached = queryClient.getQueryData<Analysis | null>(key)
      // A correction begun while this read was on its way is newer than what it brings: the page's copy stays. So does
      // it when the read left before a correction was answered, and brings a copy from before it (#140 review).
      if (saver.busy() && cached !== undefined) return cached
      if (analysis && cached?.id === analysis.id && (versions.get(analysis.id) ?? 0) > analysis.version) return cached
      return known(analysis)
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
  const theirs = query.data && states[query.data.id] === 'conflict' ? conflicts[query.data.id] : undefined
  const store = (analysis: Analysis) => {
    if (horseId !== undefined && !closed.current) queryClient.setQueryData(analysisKey(userId, horseId), analysis)
  }

  return {
    current,
    loadFailed: query.isError,
    reload: () => void query.refetch(),
    upload: async (file) => {
      if (horseId !== undefined) store(known(await guard(analysesApi.upload(horseId, file))))
    },
    enter: async (analys) => {
      if (horseId !== undefined) store(known(await guard(analysesApi.create(horseId, analys))))
    },
    correct: (analys, omrakningar) => {
      const analysis = query.data
      if (!analysis || horseId === undefined) return
      store({ ...analysis, analys, omrakningar })
      const refused = validateAnalysis(analys).length > 0
      setInvalid((s) => ({ ...s, [analysis.id]: refused }))
      // An invalid value is never sent. In a conflict the choice waits for a valid one (canKeepMine), which is sent,
      // meets the conflict again and is held.
      if (refused) saver.discard(analysis.id)
      else saver.schedule({ id: analysis.id, horseId, values: { analys, omrakningar } })
    },
    saveState: query.data ? (invalid[query.data.id] ? 'invalid' : states[query.data.id]) : undefined,
    retrySave: () => {
      if (query.data) saver.retry(query.data.id)
    },
    flush: (keepalive) => saver.flush(keepalive),
    hasUnsaved: () => saver.busy() || (query.data ? validateAnalysis(query.data.analys).length > 0 : false),
    // The page's corrections can be kept only over the same analysis, and only while every value is valid.
    conflict: theirs && {
      analys: theirs.analys,
      canKeepMine: theirs.id === query.data?.id && !invalid[theirs.id],
    },
    takeTheirs: () => {
      const mine = query.data
      if (!mine || !theirs) return
      known(theirs)
      store(theirs)
      setInvalid((s) => ({ ...s, [mine.id]: false, [theirs.id]: false }))
      setConflicts((s) => ({ ...s, [mine.id]: undefined }))
      saver.drop(mine.id)
    },
    keepMine: () => {
      const mine = query.data
      if (!mine || theirs?.id !== mine.id || invalid[mine.id]) return
      versions.set(mine.id, theirs.version)
      setConflicts((s) => ({ ...s, [mine.id]: undefined }))
      saver.retry(mine.id)
    },
  }
}
