// The signed-in user's horses on the API (#25, CF2): GET/POST /api/v1/horses, PUT/DELETE /api/v1/horses/:id, read
// with TanStack Query (ADR 0012). The form changes a horse on every keystroke, so edits are saved by an AutoSaver:
// the cache takes each edit at once and the server gets the latest one when the typing pauses. The list is never
// refetched while the workspace is open, so a refetch cannot replace edits still on their way; create and delete
// write their result into the cache instead.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { callApi, refusedByServer, sessionGuard } from './api-v1'
import { AutoSaver, type SaveState } from './autosave'
import { HorseListSchema, HorseProfileSchema, HorseSchema, type HorseProfile } from '@fodr/contracts/horses'
import type { Hastprofil } from '@fodr/domain/types'

const call = (path: string, init?: RequestInit) => callApi(`/horses${path}`, init)

// The profile without the ID, which goes in the URL; the schema drops it, as it drops any field not in the contract.
const profileOf = (horse: Hastprofil): HorseProfile => HorseProfileSchema.parse(horse)

export const horsesApi = {
  list: async (): Promise<Hastprofil[]> => HorseListSchema.parse(await (await call('')).json()).horses,
  create: async (profile: HorseProfile): Promise<Hastprofil> =>
    HorseSchema.parse(await (await call('', { method: 'POST', body: JSON.stringify(profile) })).json()),
  // keepalive lets the request outlive the page, for the save sent when the page is left.
  update: async (horse: Hastprofil, keepalive = false): Promise<void> => {
    await call(`/${horse.id}`, { method: 'PUT', body: JSON.stringify(profileOf(horse)), keepalive })
  },
  remove: async (id: string): Promise<void> => {
    await call(`/${id}`, { method: 'DELETE' })
  },
}

/** The profile a new horse starts with; the server gives it its ID. */
export function newHorseProfile(): HorseProfile {
  return {
    namn: '',
    alderAr: 10,
    kon: 'valack',
    typ: 'normalfodd',
    viktKg: 500,
    hull: 5,
    ridning: { passPerVecka: 4, minuterPerPass: 45, travGaloppMinPerPass: 15 },
    prestanda: 'fritid',
    miljo: { hallning: 'box', timmarUtePerDag: 8, klippt: false, tacke: true, lagstaTempC: -5 },
    halsa: { fang: false, ems: false, ovrigt: '' },
    grovfoder: { typ: 'hosilage', kgPerDag: 10 },
    nuvarandeFoder: [],
  }
}

/** What the workspace needs of the account's horses. */
export interface HorseStore {
  horses: Hastprofil[]
  create: () => Promise<Hastprofil>
  update: (horse: Hastprofil) => void
  remove: (id: string) => Promise<void>
  /** Undefined for a horse not edited since the page opened. */
  saveState: (id: string) => SaveState | undefined
  retrySave: (id: string) => void
  /** Sends every waiting edit, before logging out or saving a plan. */
  flush: () => Promise<void>
  /** Whether an edit is waiting, on its way or failed: the server may not hold what the page shows. */
  hasUnsaved: () => boolean
  /** Takes a horse the server changed itself (a journal entry's profile update, #28), without saving it again. */
  apply: (horse: Hastprofil) => void
}

/** The query key of every account's horses, removed when the workspace closes or the user logs out. */
export const HORSES_QUERY_KEY = ['horses']
const horsesKey = (userId: string) => [...HORSES_QUERY_KEY, userId]

// The saves a closed workspace sent on its way, per user: a workspace opened again reads the horses after them, so it
// never shows a list from before its own edits.
const closing = new Map<string, Promise<void>>()

/** The account's horses: undefined while loading, null when the read failed. */
export function useApiHorses(userId: string): { store: HorseStore | undefined | null; reload: () => void } {
  const queryClient = useQueryClient()
  const key = horsesKey(userId)
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const guard = sessionGuard(queryClient)
  const [saver] = useState(
    () =>
      new AutoSaver<Hastprofil>(
        (horse, keepalive) => guard(horsesApi.update(horse, keepalive)),
        (id, state) => setStates((s) => ({ ...s, [id]: state })),
        600,
        refusedByServer,
      ),
  )
  // Read when the workspace opens, and again when the window regains focus or the network returns (changes from another
  // device), but only while every edit here is saved: a list read meanwhile would replace edits the server does not
  // have yet; a read that was on its way when an edit began keeps the page's copy. Stale at once, or those reads would
  // never run.
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      await closing.get(userId)
      const horses = await guard(horsesApi.list())
      return saver.busy() ? (queryClient.getQueryData<Hastprofil[]>(key) ?? horses) : horses
    },
    staleTime: 0,
    refetchOnWindowFocus: () => !saver.busy(),
    refetchOnReconnect: () => !saver.busy(),
    retry: false,
  })

  // Leaving the page sends what is waiting, and asks first while an edit is not saved. Leaving the workspace (the
  // landing page, logging out, an ended session) sends it at once and drops the cached horses, health notes included,
  // so a workspace opened again shows what the server holds, never an edit that only looked saved.
  useEffect(() => {
    const onPageHide = () => saver.flushOnExit()
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.busy()) e.preventDefault()
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      closing.set(userId, saver.flush())
      queryClient.removeQueries({ queryKey: horsesKey(userId) })
    }
  }, [saver, userId, queryClient])

  if (query.isPending) return { store: undefined, reload: () => undefined }
  if (query.isError) return { store: null, reload: () => void query.refetch() }

  const setHorses = (change: (horses: Hastprofil[]) => Hastprofil[]) =>
    queryClient.setQueryData<Hastprofil[]>(key, (horses) => change(horses ?? []))

  return {
    reload: () => undefined,
    store: {
      horses: query.data,
      create: async () => {
        const horse = await guard(horsesApi.create(newHorseProfile()))
        setHorses((horses) => [...horses, horse])
        return horse
      },
      update: (horse) => {
        setHorses((horses) => horses.map((h) => (h.id === horse.id ? horse : h)))
        saver.schedule(horse)
      },
      remove: async (id) => {
        await guard(horsesApi.remove(id))
        saver.discard(id)
        setHorses((horses) => horses.filter((h) => h.id !== id))
      },
      saveState: (id) => states[id],
      retrySave: (id) => saver.retry(id),
      flush: () => saver.flush(),
      hasUnsaved: () => saver.busy(),
      apply: (horse) => setHorses((horses) => horses.map((h) => (h.id === horse.id ? horse : h))),
    },
  }
}
