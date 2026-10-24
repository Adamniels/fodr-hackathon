// The signed-in user's horses on the API (#25, CF2): GET/POST /api/v1/horses, GET/PUT/DELETE /api/v1/horses/:id, read
// with TanStack Query (ADR 0012). The form changes a horse on every keystroke, so edits are saved by an AutoSaver:
// the cache takes each edit at once and the server gets the latest one when the typing pauses. The list is read again
// only while every edit is saved, so a read cannot replace edits still on their way; create and delete write their
// result into the cache instead.
//
// A save names the version of the server's copy the page's copy was read at (#140, ADR 0017). The cache holds the
// domain's profiles, without versions; each horse's version is kept beside it and moves only when the cache takes the
// server's copy (a read, a create, a save's answer, a journal entry's update). A save the server refuses because its
// copy moved on is a conflict: the page reads the server's copy, and the user takes it or keeps their own.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { callApi, changedOnServer, refusedByServer, sessionGuard } from './api-v1'
import { AutoSaver, type SaveState } from './autosave'
import {
  HorseListSchema,
  HorseProfileSchema,
  HorseSchema,
  withoutVersion,
  type Horse,
  type HorseProfile,
} from '@fodr/contracts/horses'
import { ifMatch } from '@fodr/contracts/version'
import { changedFields } from './changes'
import type { Hastprofil } from '@fodr/domain/types'

const call = (path: string, init?: RequestInit) => callApi(`/horses${path}`, init)

// The profile without the ID, which goes in the URL; the schema drops it, as it drops any field not in the contract.
const profileOf = (horse: Hastprofil): HorseProfile => HorseProfileSchema.parse(horse)

export const horsesApi = {
  list: async (): Promise<Horse[]> => HorseListSchema.parse(await (await call('')).json()).horses,
  get: async (id: string): Promise<Horse> => HorseSchema.parse(await (await call(`/${id}`)).json()),
  create: async (profile: HorseProfile): Promise<Horse> =>
    HorseSchema.parse(await (await call('', { method: 'POST', body: JSON.stringify(profile) })).json()),
  // The save of the copy read at `version`; keepalive lets the request outlive the page, for the save sent when the
  // page is left.
  update: async (horse: Hastprofil, version: number, keepalive = false): Promise<Horse> =>
    HorseSchema.parse(
      await (
        await call(`/${horse.id}`, {
          method: 'PUT',
          body: JSON.stringify(profileOf(horse)),
          headers: ifMatch(version),
          keepalive,
        })
      ).json(),
    ),
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
  /** Sends every waiting edit, before logging out (with keepalive, #169) or saving a plan. */
  flush: (keepalive?: boolean) => Promise<void>
  /** Whether an edit is waiting, on its way or failed: the server may not hold what the page shows. */
  hasUnsaved: () => boolean
  /** Takes a horse the server changed itself (a journal entry's profile update, #28), without saving it again. */
  apply: (horse: Horse) => void
  /** The server's copy of a horse whose save was refused as based on an older copy (#140); undefined otherwise. */
  conflict: (id: string) => Hastprofil | undefined
  /** Takes the server's copy into the page, giving up the edit. */
  takeTheirs: (id: string) => void
  /** Saves the page's copy over the server's, now that the user has seen it. */
  keepMine: (id: string) => void
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
  const [conflicts, setConflicts] = useState<Partial<Record<string, Horse>>>({})
  const guard = sessionGuard(queryClient)
  // The version of the server's copy each cached horse was read at.
  const [versions] = useState(() => new Map<string, number>())
  const known = (horse: Horse): Hastprofil => {
    versions.set(horse.id, horse.version)
    return withoutVersion(horse)
  }
  const [saver] = useState(
    () =>
      new AutoSaver<Hastprofil>(
        async (horse, keepalive) => {
          try {
            // Every cached horse came from the server with its version; one without would be saved over blindly.
            const version = versions.get(horse.id)
            if (version === undefined) throw new Error(`no version of horse ${horse.id}`)
            const saved = await guard(horsesApi.update(horse, version, keepalive))
            versions.set(horse.id, saved.version)
          } catch (e) {
            if (!changedOnServer(e)) throw e
            // The server's copy moved on: read it for the user's choice. A read that fails leaves a plain failure,
            // whose retry meets the conflict again.
            const theirs = await guard(horsesApi.get(horse.id))
            // The same edit made on the other device: the server holds what this save sends, so it is saved.
            if (changedFields(horse, withoutVersion(theirs)).length === 0) {
              versions.set(horse.id, theirs.version)
              return
            }
            setConflicts((c) => ({ ...c, [horse.id]: theirs }))
            throw e
          }
        },
        (id, state) => setStates((s) => ({ ...s, [id]: state })),
        600,
        refusedByServer,
        changedOnServer,
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
      const cached = queryClient.getQueryData<Hastprofil[]>(key)
      if (saver.busy() && cached) return cached
      // A read that left before a save was answered brings a copy from before it: the page keeps its own (#140 review).
      return horses.map((horse) => {
        const own = cached?.find((h) => h.id === horse.id)
        return own && (versions.get(horse.id) ?? 0) > horse.version ? own : known(horse)
      })
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
        const horse = known(await guard(horsesApi.create(newHorseProfile())))
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
      flush: (keepalive) => saver.flush(keepalive),
      hasUnsaved: () => saver.busy(),
      // While an edit of the horse is waiting or on its way, the page keeps its copy and the version it was based on:
      // the edit then meets the update as a conflict, which lists it, instead of the page showing one copy and saving
      // another (#140 review).
      apply: (horse) => {
        if (saver.busy(horse.id)) return
        const hast = known(horse)
        setHorses((horses) => horses.map((h) => (h.id === horse.id ? hast : h)))
      },
      conflict: (id) => {
        const theirs = states[id] === 'conflict' ? conflicts[id] : undefined
        return theirs && withoutVersion(theirs)
      },
      takeTheirs: (id) => {
        const theirs = conflicts[id]
        if (!theirs) return
        const hast = known(theirs)
        setHorses((horses) => horses.map((h) => (h.id === id ? hast : h)))
        setConflicts((c) => ({ ...c, [id]: undefined }))
        saver.drop(id)
      },
      keepMine: (id) => {
        const theirs = conflicts[id]
        if (!theirs) return
        versions.set(id, theirs.version)
        setConflicts((c) => ({ ...c, [id]: undefined }))
        saver.retry(id)
      },
    },
  }
}
