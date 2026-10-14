// Ditt grovfoder jämfört med Sverige: Växas foderstatistik för skördeår 2026 (via kollegans testdata).
// Hösilage jämförs med den vanligaste gruppen, blandvall skörd 1; hö med blandvallshö. Energi och smb rp
// för häst är approximerade i källan och märks därför.

import statistik from '../data/sverigestatistik-2026.json'
import type { Grovfoderanalys } from './types'

type Fordelning = { medel: number; p10: number; p90: number }
interface Grupp {
  namn: string
  n: number
  varden: Record<string, Fordelning>
}

export interface Jamforelse {
  nyckel: string
  etikett: string
  enhet: string
  varde: number
  p10: number
  medel: number
  p90: number
  lage: 'lag' | 'normal' | 'hog'
  approximerad: boolean
}

// [statistikens nyckel, etikett, enhet, hämta värdet ur analysen, omräkning av statistiken]
const RADER: [string, string, string, (a: Grovfoderanalys) => number | undefined, number][] = [
  ['TS', 'Torrsubstans', '%', (a) => a.tsProcent, 0.1],
  ['OE', 'Energi', 'MJ/kg ts', (a) => a.perKgTs.energi, 1],
  ['smbRP', 'Smältbart råprotein', 'g/kg ts', (a) => a.perKgTs.smbRp, 1],
  ['Socker', 'Socker', 'g/kg ts', (a) => a.perKgTs.socker, 1],
  ['Aska', 'Aska', 'g/kg ts', (a) => a.askaGPerKgTs, 1],
  ['Ca', 'Kalcium', 'g/kg ts', (a) => a.perKgTs.ca, 1],
  ['P', 'Fosfor', 'g/kg ts', (a) => a.perKgTs.p, 1],
  ['Mg', 'Magnesium', 'g/kg ts', (a) => a.perKgTs.mg, 1],
  ['Na', 'Natrium', 'g/kg ts', (a) => a.perKgTs.na, 1],
  ['Fe', 'Järn', 'mg/kg ts', (a) => a.perKgTs.fe, 1],
  ['Cu', 'Koppar', 'mg/kg ts', (a) => a.perKgTs.cu, 1],
  ['Zn', 'Zink', 'mg/kg ts', (a) => a.perKgTs.zn, 1],
  ['Se', 'Selen', 'mg/kg ts', (a) => a.perKgTs.se, 1],
]
const APPROXIMERADE = new Set(['OE', 'smbRP'])

export function jamforMedSverige(analys: Grovfoderanalys): { grupp: string; n: number; rader: Jamforelse[] } {
  const grupper = statistik.grupper as Record<string, Grupp>
  const grupp = analys.typ === 'hosilage' ? grupper.blandvall_ens_s1 : grupper.ho_blandvall
  const rader: Jamforelse[] = []
  for (const [nyckel, etikett, enhet, hamta, faktor] of RADER) {
    const varde = hamta(analys)
    const f = grupp.varden[nyckel]
    if (varde === undefined || !f) continue
    const p10 = f.p10 * faktor
    const p90 = f.p90 * faktor
    rader.push({
      nyckel,
      etikett,
      enhet,
      varde,
      p10,
      medel: f.medel * faktor,
      p90,
      lage: varde < p10 ? 'lag' : varde > p90 ? 'hog' : 'normal',
      approximerad: APPROXIMERADE.has(nyckel),
    })
  }
  return { grupp: grupp.namn, n: grupp.n, rader }
}
