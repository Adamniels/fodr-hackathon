import type { UtlastAnalys } from './domain/analysis'
import type { Ingrediens, NuvarandeFoder, Prestanda } from './domain/types'

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.fel ?? `Fel ${res.status}`)
  return data as T
}

export async function filTillBase64(fil: File): Promise<{ mediaType: string; base64: string }> {
  const buffer = new Uint8Array(await fil.arrayBuffer())
  let binar = ''
  for (let i = 0; i < buffer.length; i += 0x8000) binar += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
  return { mediaType: fil.type || 'application/pdf', base64: btoa(binar) }
}

export const lasAnalys = (fil: { mediaType: string; base64: string }) => post<UtlastAnalys>('/api/analys', fil)

export interface ProfilTolkning {
  grovfoderKgPerDag: number | null
  grovfoderTyp: 'hosilage' | 'ho' | null
  nuvarandeFoder: NuvarandeFoder[]
  ras: string | null
  prestanda: Prestanda | null
  miljo: {
    hallning: 'box' | 'losdrift' | null
    timmarUtePerDag: number | null
    klippt: boolean | null
    tacke: boolean | null
  }
  fang: boolean
  ems: boolean
  ppid: boolean
  magsar: boolean
  pssm: boolean
  luftvagar: boolean
  tandproblem: boolean
  proteinkanslig: boolean
  undvik: Ingrediens[]
  ovrigt: string
  foljdfragor: string[]
}

export const tolkaProfil = (body: {
  foderText: string
  halsaText: string
  tidigareSvar: { fraga: string; svar: string }[]
  produkter: { id: string; namn: string }[]
}) => post<ProfilTolkning>('/api/profil', body)

export const forklaraPlan = (underlag: unknown) => post<{ text: string }>('/api/forklaring', underlag)

export interface JournalAnalys {
  sammanfattning: string
  monster: { iakttagelse: string; mojligKoppling: string | null; datum: string | null }[]
  veterinar: { behovs: boolean; skal: string | null }
  nastaSteg: string[]
}

export const analyseraJournal = (underlag: unknown) => post<JournalAnalys>('/api/journal', underlag)
