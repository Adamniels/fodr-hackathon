// Typical roughage values for when the analysis lacks a nutrient (e.g. a basic analysis without minerals).
// Values per kg DM. Each value carries its source, as a code, so the interface can show it (ADR 0014).

import type { Kallhanvisning } from './messages'
import type { NutrientKey } from './nutrients'
import type { Grovfodertyp } from './types'

interface Schablon {
  varde: number
  kalla: Kallhanvisning
}

const TYPICAL: Kallhanvisning = { code: 'source.typicalForage', params: {} }
const TYPICAL_LOW_SELENIUM: Kallhanvisning = { code: 'source.typicalForageLowSelenium', params: {} }
const TABLE_26_TIMOTHY: Kallhanvisning = { code: 'source.table26Timothy', params: {} }
const TABLE_29_GRASS: Kallhanvisning = { code: 'source.table29Grass', params: {} }
const TABLE_24_CAROTENE_LOWER: Kallhanvisning = { code: 'source.table24CaroteneLower', params: {} }
const TABLE_24_LOWER: Kallhanvisning = { code: 'source.table24Lower', params: {} }
const TABLE_24_FIELD_DRIED_HAY: Kallhanvisning = { code: 'source.table24FieldDriedHay', params: {} }
const TABLE_24: Kallhanvisning = { code: 'source.table24', params: {} }

const GEMENSAM: Partial<Record<NutrientKey, Schablon>> = {
  // ANTAGANDE: typical values for Swedish grass roughage. SLU table 20 gives only ranges.
  ca: { varde: 3.5, kalla: TYPICAL },
  p: { varde: 2.5, kalla: TYPICAL },
  mg: { varde: 1.5, kalla: TYPICAL },
  na: { varde: 0.3, kalla: TYPICAL },
  // SLU table 26, timothy. SLU notes that the values vary a lot between batches.
  fe: { varde: 82, kalla: TABLE_26_TIMOTHY },
  mn: { varde: 45, kalla: TABLE_26_TIMOTHY },
  cu: { varde: 5, kalla: TABLE_26_TIMOTHY },
  zn: { varde: 32, kalla: TABLE_26_TIMOTHY },
  co: { varde: 0.06, kalla: TABLE_26_TIMOTHY },
  jod: { varde: 0.3, kalla: TABLE_26_TIMOTHY },
  // ANTAGANDE: SLU says Swedish soils are low in selenium but gives no value for roughage.
  se: { varde: 0.03, kalla: TYPICAL_LOW_SELENIUM },
  starkelse: { varde: 0, kalla: TABLE_29_GRASS },
}

const PER_TYP: Record<Grovfodertyp, Partial<Record<NutrientKey, Schablon>>> = {
  // SLU table 24, the lower limit. 1 mg carotene = 400 IU vitamin A.
  hosilage: {
    vitA: { varde: 10 * 400, kalla: TABLE_24_CAROTENE_LOWER },
    vitE: { varde: 15, kalla: TABLE_24_LOWER },
  },
  ho: {
    vitA: { varde: 5 * 400, kalla: TABLE_24_CAROTENE_LOWER },
    vitD: { varde: 1000, kalla: TABLE_24_FIELD_DRIED_HAY },
    vitE: { varde: 12, kalla: TABLE_24 },
  },
}

export function hittaSchablon(typ: Grovfodertyp, key: NutrientKey): Schablon | undefined {
  return PER_TYP[typ][key] ?? GEMENSAM[key]
}
