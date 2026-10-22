// Saved plans on the API (#27, CF5): the server computes and stores a plan when the owner saves it, and the page then
// shows what the server computed (ADR 0004). The horse's latest saved plan is read per horse, so the plan step can say
// whether the plan on screen is the saved one: it is when it was computed from the same profile, analysis and
// catalogue.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { LatestPlanSchema, SavedPlanSchema, type SavedPlan } from '@fodr/contracts/plans'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { callApi, sessionGuard } from './api-v1'

const base = (horseId: string) => `/horses/${horseId}/plans`

export const plansApi = {
  save: async (horseId: string, analysisId: string): Promise<SavedPlan> =>
    SavedPlanSchema.parse(
      await (await callApi(base(horseId), { method: 'POST', body: JSON.stringify({ analysisId }) })).json(),
    ),
  latest: async (horseId: string): Promise<SavedPlan | null> =>
    LatestPlanSchema.parse(await (await callApi(`${base(horseId)}/latest`)).json()).plan,
}

/** Whether the saved plan was computed from exactly these inputs and this catalogue, so it is the plan on screen. */
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
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: [...PLANS_QUERY_KEY, userId] })
    },
    [queryClient, userId],
  )
  return {
    latest: horseId === undefined ? null : query.data,
    save: async (analysisId: string): Promise<SavedPlan> => {
      if (horseId === undefined) throw new Error('No horse to save a plan for')
      const saved = await guard(plansApi.save(horseId, analysisId))
      queryClient.setQueryData(latestKey(userId, horseId), saved)
      return saved
    },
  }
}
