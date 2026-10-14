// Rasregister. Typen (lättfödd, normalfödd, svårfödd) följer SLU tabell 2: ponnyer och
// kallblodstyper lättfödda, varmblod normalfödda, fullblod svårfödda. Viktintervall från SLU
// tabell 33 där rasen finns med, annars utelämnat hellre än gissat.

import type { Hasttyp } from './types'

export interface Ras {
  id: string
  namn: string
  typ: Hasttyp
  viktKg?: { min: number; max: number }
}

export const RASER: Ras[] = [
  { id: 'shetland', namn: 'Shetlandsponny', typ: 'lattfodd', viktKg: { min: 100, max: 200 } },
  { id: 'russ', namn: 'Gotlandsruss', typ: 'lattfodd', viktKg: { min: 150, max: 250 } },
  { id: 'ponny', namn: 'Ponny, övrig (t.ex. welsh, connemara)', typ: 'lattfodd' },
  { id: 'islandshast', namn: 'Islandshäst', typ: 'lattfodd', viktKg: { min: 280, max: 400 } },
  { id: 'fjordhast', namn: 'Fjordhäst', typ: 'lattfodd' },
  { id: 'nordsvensk', namn: 'Nordsvensk brukshäst / kallblodstravare', typ: 'lattfodd' },
  { id: 'ardenner', namn: 'Ardenner', typ: 'lattfodd', viktKg: { min: 700, max: 800 } },
  { id: 'varmblod_rid', namn: 'Varmblodig ridhäst / halvblod', typ: 'normalfodd', viktKg: { min: 450, max: 700 } },
  { id: 'varmblod_trav', namn: 'Varmblodig travhäst', typ: 'normalfodd', viktKg: { min: 400, max: 600 } },
  { id: 'arab', namn: 'Arabiskt fullblod', typ: 'svarfodd', viktKg: { min: 350, max: 450 } },
  { id: 'fullblod', namn: 'Engelskt fullblod', typ: 'svarfodd', viktKg: { min: 400, max: 600 } },
]

export const hittaRas = (id?: string) => RASER.find((r) => r.id === id)
