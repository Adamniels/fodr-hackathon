// Each horse's journal on the API (#28, CF7), read with TanStack Query per horse. A new entry is posted; with
// "Uppdatera profilen" the server writes the weight and condition into the horse in the same transaction and returns
// it, and the horses cache takes it, so the plan preview recalculates (CF7). An entry made by saving a plan comes back
// with the plan (plans.ts) and is put into the cache here. The cache is dropped when the workspace closes.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { CreatedJournalEntrySchema, JournalSchema, type NewJournalEntry } from '@fodr/contracts/journal'
import type { Horse } from '@fodr/contracts/horses'
import type { Journalpost } from '@fodr/domain/journal'
import { callApi, sessionGuard } from './api-v1'

/** A new entry as the form makes it: no ID or creation time, which the store gives it. */
export type EntryDraft = Omit<NewJournalEntry, 'updateProfile'>

/** What the journal step needs of the current horse's journal, from the API for an account or the browser for the demo. */
export interface JournalStore {
  /** Undefined while it loads. */
  entries: Journalpost[] | undefined
  loadFailed: boolean
  reload: () => void
  /** Adds the entry, and with `updateProfile` its weight and condition to the profile; rejects when refused. */
  add: (draft: EntryDraft, updateProfile: boolean) => Promise<void>
  /** Puts an entry made elsewhere (by saving a plan) into the journal. */
  addSaved: (entry: Journalpost) => void
  /** A deleted horse's journal goes with it: on the server by cascade, in the demo's browser here. */
  forgetHorse: (horseId: string) => void
}

const base = (horseId: string) => `/horses/${horseId}/journal`

export const journalApi = {
  list: async (horseId: string): Promise<Journalpost[]> =>
    JournalSchema.parse(await (await callApi(base(horseId))).json()).entries,
  add: async (horseId: string, entry: NewJournalEntry) =>
    CreatedJournalEntrySchema.parse(
      await (await callApi(base(horseId), { method: 'POST', body: JSON.stringify(entry) })).json(),
    ),
}

/** The query key of every account's journals, removed when the workspace closes or the user logs out. */
export const JOURNAL_QUERY_KEY = ['journal']
const journalKey = (userId: string, horseId: string) => [...JOURNAL_QUERY_KEY, userId, horseId]

/** The account's journal for the horse; `onHorse` takes the profile the server updated from an entry. */
export function useApiJournal(
  userId: string,
  horseId: string | undefined,
  onHorse: (horse: Horse) => void,
): JournalStore {
  const queryClient = useQueryClient()
  const guard = sessionGuard(queryClient)
  const query = useQuery({
    queryKey: journalKey(userId, horseId ?? ''),
    // enabled only with a horse.
    queryFn: () => guard(journalApi.list(horseId ?? '')),
    enabled: horseId !== undefined,
    staleTime: Infinity,
    retry: false,
  })
  // Closing the workspace drops the cached journals; an answer that comes after that is not put back.
  const closed = useRef(false)
  useEffect(() => {
    closed.current = false
    return () => {
      closed.current = true
      queryClient.removeQueries({ queryKey: [...JOURNAL_QUERY_KEY, userId] })
    }
  }, [queryClient, userId])

  const append = (forHorse: string, entry: Journalpost) => {
    if (closed.current) return
    queryClient.setQueryData<Journalpost[]>(journalKey(userId, forHorse), (entries) => [...(entries ?? []), entry])
  }

  return {
    entries: horseId === undefined ? [] : query.data,
    loadFailed: query.isError,
    reload: () => void query.refetch(),
    add: async (draft, updateProfile) => {
      if (horseId === undefined) return
      const { entry, horse } = await guard(journalApi.add(horseId, { ...draft, updateProfile }))
      append(horseId, entry)
      if (horse && !closed.current) onHorse(horse)
    },
    addSaved: (entry) => {
      if (horseId !== undefined) append(horseId, entry)
    },
    forgetHorse: () => undefined,
  }
}
