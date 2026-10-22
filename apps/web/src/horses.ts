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

/** Where a horse's edits are: on their way to the server, saved, or failed and kept for a retry. */
export type SaveState = 'saving' | 'saved' | 'failed'

/**
 * Saves each horse's latest edit once the edits pause for `delayMs`. One save per horse is in flight at a time, and
 * the next one sends the newest edit, so an older edit can never reach the server after a newer one. A failed edit is
 * kept for retry() unless a newer edit, which holds its changes too, is waiting.
 */
export class AutoSaver {
  private readonly waiting = new Map<string, Hastprofil>()
  private readonly failed = new Map<string, Hastprofil>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly inFlight = new Map<string, Promise<void>>()

  private readonly save: (horse: Hastprofil, keepalive: boolean) => Promise<void>
  private readonly onState: (id: string, state: SaveState) => void
  private readonly delayMs: number

  constructor(
    save: (horse: Hastprofil, keepalive: boolean) => Promise<void>,
    onState: (id: string, state: SaveState) => void,
    delayMs = 600,
  ) {
    this.save = save
    this.onState = onState
    this.delayMs = delayMs
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
    const horse = this.failed.get(id)
    if (!horse) return
    this.failed.delete(id)
    this.waiting.set(id, horse)
    this.onState(id, 'saving')
    this.send(id)
  }

  /** Sends every waiting edit now; resolves when every save has settled, failed or not. */
  async flush(): Promise<void> {
    for (const id of [...this.waiting.keys()]) this.send(id)
    await Promise.all(this.inFlight.values())
  }

  /** The page is being left: sends every waiting edit with keepalive, without waiting for an answer. */
  flushOnExit(): void {
    for (const [id, horse] of this.waiting) {
      clearTimeout(this.timers.get(id))
      this.timers.delete(id)
      this.waiting.delete(id)
      void this.save(horse, true).catch(() => undefined)
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
        } catch {
          if (!this.waiting.has(id)) this.failed.set(id, horse)
        }
      }
      this.inFlight.delete(id)
      if (this.failed.has(id)) this.onState(id, 'failed')
      else this.onState(id, 'saved')
    }
    this.inFlight.set(id, run())
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

const horsesKey = (userId: string) => ['horses', userId]

/** The account's horses: undefined while loading, null when the read failed. */
export function useApiHorses(userId: string): { store: HorseStore | undefined | null; reload: () => void } {
  const queryClient = useQueryClient()
  const key = horsesKey(userId)
  const query = useQuery({
    queryKey: key,
    queryFn: horsesApi.list,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })
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
      ),
  )

  // Leaving the page sends what is waiting; leaving the workspace (the landing page) sends it at once.
  useEffect(() => {
    const onPageHide = () => saver.flushOnExit()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      void saver.flush()
    }
  }, [saver])

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
