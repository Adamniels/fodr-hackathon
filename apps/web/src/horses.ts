// The signed-in user's horses on the API (#25, CF2): GET/POST /api/v1/horses, PUT/DELETE /api/v1/horses/:id, read
// with TanStack Query (ADR 0012). The form changes a horse on every keystroke, so edits are saved by an AutoSaver:
// the cache takes each edit at once and the server gets the latest one when the typing pauses. The list is never
// refetched while the workspace is open, so a refetch cannot replace edits still on their way; create and delete
// write their result into the cache instead.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ME_QUERY_KEY } from './auth-client'
import { HorseListSchema, HorseProfileSchema, HorseSchema, type HorseProfile } from '@fodr/contracts/horses'
import { ProblemSchema } from '@fodr/contracts/problem'
import type { Hastprofil } from '@fodr/domain/types'

/** A failed call to the horses API, with the problem code when the server sent one (ADR 0013). */
export class HorseApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, code: string | undefined) {
    super(code ?? `HTTP ${String(status)}`)
    this.name = 'HorseApiError'
    this.status = status
    this.code = code
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`/api/v1/horses${path}`, {
    ...init,
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
  })
  if (res.ok) return res
  const problem = ProblemSchema.safeParse(await res.json().catch(() => null))
  throw new HorseApiError(res.status, problem.success ? problem.data.code : undefined)
}

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

/**
 * Where a horse's edits are: on their way to the server, saved, failed and kept for a retry, or refused by the server
 * as invalid, which a retry cannot change.
 */
export type SaveState = 'saving' | 'saved' | 'failed' | 'refused'

/**
 * Saves each horse's latest edit once the edits pause for `delayMs`. One save per horse is in flight at a time, and
 * the next one sends the newest edit, so an older edit can never reach the server after a newer one. A failed edit is
 * kept for retry() unless a newer edit, which holds its changes too, is waiting. `refused` tells a failure no retry can
 * fix (the server called the edit invalid) from one that may pass later.
 */
export class AutoSaver {
  private readonly waiting = new Map<string, Hastprofil>()
  private readonly failed = new Map<string, { horse: Hastprofil; refused: boolean }>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly inFlight = new Map<string, Promise<void>>()

  private readonly save: (horse: Hastprofil, keepalive: boolean) => Promise<void>
  private readonly onState: (id: string, state: SaveState) => void
  private readonly delayMs: number
  private readonly refused: (error: unknown) => boolean

  constructor(
    save: (horse: Hastprofil, keepalive: boolean) => Promise<void>,
    onState: (id: string, state: SaveState) => void,
    delayMs = 600,
    refused: (error: unknown) => boolean = () => false,
  ) {
    this.save = save
    this.onState = onState
    this.delayMs = delayMs
    this.refused = refused
  }

  /** Whether any edit is waiting, on its way, or failed: the server may not hold what the page shows. */
  busy(): boolean {
    return this.waiting.size > 0 || this.inFlight.size > 0 || this.failed.size > 0
  }

  schedule(horse: Hastprofil): void {
    this.waiting.set(horse.id, horse)
    this.failed.delete(horse.id)
    clearTimeout(this.timers.get(horse.id))
    this.timers.set(
      horse.id,
      setTimeout(() => this.send(horse.id), this.delayMs),
    )
    this.onState(horse.id, 'saving')
  }

  retry(id: string): void {
    const failed = this.failed.get(id)
    if (!failed) return
    this.failed.delete(id)
    this.waiting.set(id, failed.horse)
    this.onState(id, 'saving')
    this.send(id)
  }

  /**
   * Sends every waiting edit now, and once more every failed one that a retry could fix; resolves when every save has
   * settled, failed or not.
   */
  async flush(): Promise<void> {
    for (const [id, failed] of this.failed) if (!failed.refused) this.retry(id)
    for (const id of [...this.waiting.keys()]) this.send(id)
    await Promise.all(this.inFlight.values())
  }

  /**
   * The page is being left: sends every waiting edit with keepalive, without waiting for an answer. A horse with a save
   * on its way sends after it, so the order holds if the page lives that long. The answers still set the state, for a
   * page that comes back from the back/forward cache.
   */
  flushOnExit(): void {
    for (const [id, horse] of this.waiting) {
      clearTimeout(this.timers.get(id))
      this.timers.delete(id)
      this.waiting.delete(id)
      const sent = (this.inFlight.get(id) ?? Promise.resolve()).then(() => this.save(horse, true))
      const settled = sent.then(
        () => this.settle(id),
        (e: unknown) => {
          if (!this.waiting.has(id)) this.failed.set(id, { horse, refused: this.refused(e) })
          this.settle(id)
        },
      )
      this.inFlight.set(id, settled)
    }
  }

  /** The horse is deleted: its waiting and failed edits are dropped. */
  discard(id: string): void {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    this.waiting.delete(id)
    this.failed.delete(id)
  }

  private send(id: string): void {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    // A save in flight sends the newest waiting edit when it is done.
    if (this.inFlight.has(id)) return
    const run = async () => {
      let horse: Hastprofil | undefined
      while ((horse = this.waiting.get(id))) {
        this.waiting.delete(id)
        clearTimeout(this.timers.get(id))
        this.timers.delete(id)
        try {
          await this.save(horse, false)
        } catch (e) {
          if (!this.waiting.has(id)) this.failed.set(id, { horse, refused: this.refused(e) })
        }
      }
      this.settle(id)
    }
    this.inFlight.set(id, run())
  }

  private settle(id: string): void {
    this.inFlight.delete(id)
    // A newer edit came in meanwhile: its own timer sends it.
    if (this.waiting.has(id)) return
    const failed = this.failed.get(id)
    this.onState(id, failed ? (failed.refused ? 'refused' : 'failed') : 'saved')
  }
}

/** What the workspace needs of a horse store, the API's for an account or the browser's for the demo (demo.ts). */
export interface HorseStore {
  horses: Hastprofil[]
  create: () => Promise<Hastprofil>
  update: (horse: Hastprofil) => void
  remove: (id: string) => Promise<void>
  /** Undefined for a horse not edited since the page opened, and always for the demo. */
  saveState: (id: string) => SaveState | undefined
  retrySave: (id: string) => void
  /** Sends every waiting edit, before logging out. */
  flush: () => Promise<void>
}

/** The query key of every account's horses, removed when the workspace closes or the user logs out. */
export const HORSES_QUERY_KEY = ['horses']
const horsesKey = (userId: string) => [...HORSES_QUERY_KEY, userId]

// The saves a closed workspace sent on its way, per user: a workspace opened again reads the horses after them, so it
// never shows a list from before its own edits.
const closing = new Map<string, Promise<void>>()

const refusedByServer = (e: unknown) => e instanceof HorseApiError && [400, 413, 415].includes(e.status)

/** The account's horses: undefined while loading, null when the read failed. */
export function useApiHorses(userId: string): { store: HorseStore | undefined | null; reload: () => void } {
  const queryClient = useQueryClient()
  const key = horsesKey(userId)
  const [states, setStates] = useState<Record<string, SaveState>>({})
  // An expired session answers 401: the session is read again, and the workspace gate sends to /login.
  const guard = async <T>(request: Promise<T>): Promise<T> => {
    try {
      return await request
    } catch (e) {
      if (e instanceof HorseApiError && e.status === 401) void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      throw e
    }
  }
  const [saver] = useState(
    () =>
      new AutoSaver(
        (horse, keepalive) => guard(horsesApi.update(horse, keepalive)),
        (id, state) => setStates((s) => ({ ...s, [id]: state })),
        600,
        refusedByServer,
      ),
  )
  // Read when the workspace opens, and again when the window regains focus (changes from another device), but only
  // while every edit here is saved: a list read meanwhile would replace edits the server does not have yet.
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      await closing.get(userId)
      return guard(horsesApi.list())
    },
    staleTime: Infinity,
    refetchOnWindowFocus: () => !saver.busy(),
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
    },
  }
}
