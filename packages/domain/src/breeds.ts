// Breed register. The type (easy, normal, hard keeper) follows SLU table 2: ponies and cold-blooded types are easy
// keepers, warmbloods normal, thoroughbreds hard. Weight ranges from SLU table 33 where the breed is listed,
// otherwise left out rather than guessed. Breed names live in the web catalogue under domain.breed.<id> (ADR 0014).

import type { Hasttyp } from './types'

export interface Ras {
  id: string
  typ: Hasttyp
  viktKg?: { min: number; max: number }
}

export const RASER: Ras[] = [
  { id: 'shetland', typ: 'lattfodd', viktKg: { min: 100, max: 200 } },
  { id: 'russ', typ: 'lattfodd', viktKg: { min: 150, max: 250 } },
  { id: 'ponny', typ: 'lattfodd' },
  { id: 'islandshast', typ: 'lattfodd', viktKg: { min: 280, max: 400 } },
  { id: 'fjordhast', typ: 'lattfodd' },
  { id: 'nordsvensk', typ: 'lattfodd' },
  { id: 'ardenner', typ: 'lattfodd', viktKg: { min: 700, max: 800 } },
  { id: 'varmblod_rid', typ: 'normalfodd', viktKg: { min: 450, max: 700 } },
  { id: 'varmblod_trav', typ: 'normalfodd', viktKg: { min: 400, max: 600 } },
  { id: 'arab', typ: 'svarfodd', viktKg: { min: 350, max: 450 } },
  { id: 'fullblod', typ: 'svarfodd', viktKg: { min: 400, max: 600 } },
]

export const hittaRas = (id?: string) => RASER.find((r) => r.id === id)
