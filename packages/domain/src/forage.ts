// Schablonvärden för grovfoder när analysen saknar ett ämne (t.ex. en basanalys utan mineraler).
// Värden per kg ts. Varje värde bär sin källa så att det kan visas i gränssnittet.

import type { NutrientKey } from './nutrients'
import type { Grovfodertyp } from './types'

interface Schablon {
  varde: number
  kalla: string
}

const GEMENSAM: Partial<Record<NutrientKey, Schablon>> = {
  // ANTAGANDE: typiska värden för svenskt gräsvallfoder. SLU tabell 20 anger bara intervall.
  ca: { varde: 3.5, kalla: 'Typvärde svenskt vallfoder (ej SLU)' },
  p: { varde: 2.5, kalla: 'Typvärde svenskt vallfoder (ej SLU)' },
  mg: { varde: 1.5, kalla: 'Typvärde svenskt vallfoder (ej SLU)' },
  na: { varde: 0.3, kalla: 'Typvärde svenskt vallfoder (ej SLU)' },
  // SLU tabell 26, timotej. SLU påpekar att värdena varierar mycket mellan partier.
  fe: { varde: 82, kalla: 'SLU tabell 26 (timotej)' },
  mn: { varde: 45, kalla: 'SLU tabell 26 (timotej)' },
  cu: { varde: 5, kalla: 'SLU tabell 26 (timotej)' },
  zn: { varde: 32, kalla: 'SLU tabell 26 (timotej)' },
  co: { varde: 0.06, kalla: 'SLU tabell 26 (timotej)' },
  jod: { varde: 0.3, kalla: 'SLU tabell 26 (timotej)' },
  // ANTAGANDE: SLU anger att svenska jordar är selenfattiga men ger inget värde för vallfoder.
  se: { varde: 0.03, kalla: 'Typvärde selenfattigt svenskt vallfoder (ej SLU)' },
  starkelse: { varde: 0, kalla: 'SLU tabell 29 (gräs)' },
}

const PER_TYP: Record<Grovfodertyp, Partial<Record<NutrientKey, Schablon>>> = {
  // SLU tabell 24, nedre gränsen. 1 mg karotin = 400 IE vitamin A.
  hosilage: {
    vitA: { varde: 10 * 400, kalla: 'SLU tabell 24 (karotin, nedre gräns)' },
    vitE: { varde: 15, kalla: 'SLU tabell 24 (nedre gräns)' },
  },
  ho: {
    vitA: { varde: 5 * 400, kalla: 'SLU tabell 24 (karotin, nedre gräns)' },
    vitD: { varde: 1000, kalla: 'SLU tabell 24 (fälttorkat hö)' },
    vitE: { varde: 12, kalla: 'SLU tabell 24' },
  },
}

export function hittaSchablon(typ: Grovfodertyp, key: NutrientKey): Schablon | undefined {
  return PER_TYP[typ][key] ?? GEMENSAM[key]
}
