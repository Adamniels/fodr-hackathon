// Saved plans on the API (#27, CF5): the server computes and stores a plan when the owner saves it, and the page then
// shows what the server computed (ADR 0004). The horse's latest saved plan is read per horse, so the plan step can say
// whether the plan on screen is the saved one: it is when it was computed from the same profile, analysis and
// catalogue. The plan step saves the plan it shows (#32), so each plan shown has an ID; its AI explanation is stored with
// it on the server, read back on every later visit and written again only on request (CF6).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import type { ExplanationRequest } from '@fodr/contracts/ai'
import { LatestPlanSchema, PlanExplanationSchema, SavedPlanResponseSchema, type SavedPlan } from '@fodr/contracts/plans'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { callApi, sessionGuard } from './api-v1'

const base = (horseId: string) => `/horses/${horseId}/plans`

const explanationPath = (horseId: string, planId: string) => `${base(horseId)}/${planId}/explanation`

export const plansApi = {
  // With a journal date the server makes the plan's journal entry in the same transaction (#28). A plan the newest
  // saved one equals is not stored again (#32).
  save: async (horseId: string, analysisId: string, journalDatum?: string) =>
    SavedPlanResponseSchema.parse(
      await (
        await callApi(base(horseId), { method: 'POST', body: JSON.stringify({ analysisId, journalDatum }) })
      ).json(),
    ),
  latest: async (horseId: string): Promise<SavedPlan | null> =>
    LatestPlanSchema.parse(await (await callApi(`${base(horseId)}/latest`)).json()).plan,
  /** The plan's stored explanation, or null; never asks the AI. */
  explanation: async (horseId: string, planId: string) =>
    PlanExplanationSchema.parse(await (await callApi(explanationPath(horseId, planId))).json()).explanation,
  /** The stored explanation, or a new one the API writes when there is none or `regenerate` is set. */
  explain: async (horseId: string, planId: string, request: ExplanationRequest, regenerate: boolean) =>
    PlanExplanationSchema.parse(
      await (
        await callApi(explanationPath(horseId, planId), {
          method: 'POST',
          body: JSON.stringify({ request, regenerate }),
        })
      ).json(),
    ).explanation,
}

/**
 * Why a plan was not saved as shown: an edit the server does not have (failed, refused or invalid), or a saved plan
 * that came out different from the one on screen.
 */
export class PlanSaveError extends Error {
  readonly code: 'unsaved' | 'differs'

  constructor(code: 'unsaved' | 'differs') {
    super(code)
    this.name = 'PlanSaveError'
    this.code = code
  }
}

/**
 * Whether the saved plan was computed from exactly these inputs and this catalogue, so it is the plan on screen. On
 * purpose the whole profile counts, the name and the free-text note too, though the engine reads neither: a profile
 * that changed in any way is not called saved.
 */
export function isSavedFor(
  saved: SavedPlan | null | undefined,
  hast: Hastprofil,
  analys: Grovfoderanalys,
  catalogueVersion: string,
): saved is SavedPlan {
  if (!saved || saved.productSetVersion !== catalogueVersion) return false
  return canonical(saved.inputs) === canonical({ profil: hast, analys })
}

// JSON with every object's keys sorted: a profile edited in the form holds its keys in another order than the server
// sends them, and the same values must still compare equal. An undefined field is left out, as JSON does.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )

/** The query key of every account's saved plans, removed when the workspace closes or the user logs out. */
export const PLANS_QUERY_KEY = ['plans']
const latestKey = (userId: string, horseId: string) => [...PLANS_QUERY_KEY, userId, horseId]

/** The horse's latest saved plan (undefined while it loads), and saving a new one. */
export function useSavedPlans(userId: string, horseId: string | undefined) {
  const queryClient = useQueryClient()
  const guard = sessionGuard(queryClient)
  const query = useQuery({
    queryKey: latestKey(userId, horseId ?? ''),
    // enabled only with a horse.
    queryFn: () => guard(plansApi.latest(horseId ?? '')),
    enabled: horseId !== undefined,
    staleTime: Infinity,
    retry: false,
  })
  // Closing the workspace drops the cached plans; a save answered after that is not put back.
  const closed = useRef(false)
  useEffect(() => {
    closed.current = false
    return () => {
      closed.current = true
      queryClient.removeQueries({ queryKey: [...PLANS_QUERY_KEY, userId] })
    }
  }, [queryClient, userId])
  return {
    latest: horseId === undefined ? null : query.data,
    save: async (analysisId: string, journalDatum?: string) => {
      if (horseId === undefined) throw new Error('No horse to save a plan for')
      const saved = await guard(plansApi.save(horseId, analysisId, journalDatum))
      if (!closed.current) queryClient.setQueryData(latestKey(userId, horseId), saved.plan)
      return saved
    },
  }
}

/**
 * The saved plan's AI explanation (#32, CF6): the stored one, or one the API writes when there is none, built from the
 * plan as the page shows it. Nothing is asked before the plan has an ID. `rewrite` asks for a new one; while it is
 * written, and after it failed, the text gives way to the writing note or the error, and the stored text comes back on
 * the next visit.
 */
export function usePlanExplanation(
  userId: string,
  horseId: string,
  planId: string | undefined,
  request: ExplanationRequest,
) {
  const queryClient = useQueryClient()
  const guard = sessionGuard(queryClient)
  const queryKey = useMemo(() => [...PLANS_QUERY_KEY, userId, 'explanation', planId ?? ''], [userId, planId])
  const query = useQuery({
    queryKey,
    // enabled only with a plan ID.
    queryFn: async () => {
      const id = planId ?? ''
      return (await guard(plansApi.explanation(horseId, id))) ?? guard(plansApi.explain(horseId, id, request, false))
    },
    enabled: planId !== undefined,
    // Never refetched on its own, and a failure is shown at once rather than retried (#21).
    staleTime: Infinity,
    retry: false,
  })
  const rewrite = useMutation({
    mutationFn: () => guard(plansApi.explain(horseId, planId ?? '', request, true)),
    onSuccess: (explanation) => queryClient.setQueryData(queryKey, explanation),
  })
  // A failure belongs to the visit that saw it: leaving the plan resets a failed read, so a revisit asks again (#21).
  useEffect(
    () => () => {
      if (queryClient.getQueryState(queryKey)?.status === 'error')
        void queryClient.resetQueries({ queryKey, exact: true })
    },
    [queryClient, queryKey],
  )
  const writing = query.isFetching || rewrite.isPending
  const error = writing ? null : (rewrite.error ?? query.error)
  return {
    text: writing || error ? null : (query.data?.text ?? null),
    error,
    rewrite: () => rewrite.mutate(),
  }
}
