import type { UtlastAnalys } from '@fodr/domain/analysis'
import type { Ingrediens, NuvarandeFoder, Prestanda } from '@fodr/domain/types'
import i18n from './i18n'

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { fel?: string }).fel ?? i18n.t('errors.http', { status: String(res.status) }))
  return data as T
}

export async function fileToBase64(file: File): Promise<{ mediaType: string; base64: string }> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
  return { mediaType: file.type || 'application/pdf', base64: btoa(binary) }
}

export const readAnalysis = (file: { mediaType: string; base64: string }) => post<UtlastAnalys>('/api/analys', file)

export interface ProfileInterpretation {
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

export const interpretProfile = (body: {
  foderText: string
  halsaText: string
  tidigareSvar: { fraga: string; svar: string }[]
  produkter: { id: string; namn: string }[]
}) => post<ProfileInterpretation>('/api/profil', body)

export const explainPlan = (payload: unknown) => post<{ text: string }>('/api/forklaring', payload)

export interface JournalAnalysis {
  sammanfattning: string
  monster: { iakttagelse: string; mojligKoppling: string | null; datum: string | null }[]
  veterinar: { behovs: boolean; skal: string | null }
  nastaSteg: string[]
}

export const analyzeJournal = (payload: unknown) => post<JournalAnalysis>('/api/journal', payload)
