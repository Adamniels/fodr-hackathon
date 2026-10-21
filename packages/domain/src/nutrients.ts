// The nutrients the model handles. Requirement and supply are always per horse and day in the unit below.
// Feed values are per kg dry matter (roughage) or per kg feed (products). Names live in the web catalogue under
// domain.nutrient.<key> (ADR 0014).

export const NUTRIENTS = {
  energi: { unit: 'MJ', group: 'energi' },
  smbRp: { unit: 'g', group: 'energi' },
  ca: { unit: 'g', group: 'makro' },
  p: { unit: 'g', group: 'makro' },
  mg: { unit: 'g', group: 'makro' },
  na: { unit: 'g', group: 'makro' },
  fe: { unit: 'mg', group: 'mikro' },
  mn: { unit: 'mg', group: 'mikro' },
  cu: { unit: 'mg', group: 'mikro' },
  zn: { unit: 'mg', group: 'mikro' },
  co: { unit: 'mg', group: 'mikro' },
  jod: { unit: 'mg', group: 'mikro' },
  se: { unit: 'mg', group: 'mikro' },
  vitA: { unit: 'IE', group: 'vitamin' },
  vitD: { unit: 'IE', group: 'vitamin' },
  vitE: { unit: 'mg', group: 'vitamin' },
  b1: { unit: 'mg', group: 'vitamin' },
  b2: { unit: 'mg', group: 'vitamin' },
  biotin: { unit: 'mg', group: 'vitamin' },
  socker: { unit: 'g', group: 'kolhydrat' },
  starkelse: { unit: 'g', group: 'kolhydrat' },
} as const

export type NutrientKey = keyof typeof NUTRIENTS
export const NUTRIENT_KEYS = Object.keys(NUTRIENTS) as NutrientKey[]

/** Contents of a feed. A missing value means unknown, never zero. */
export type NutrientValues = Partial<Record<NutrientKey, number>>

/** Table salt is 39.3 % sodium (SLU rounds to 40 %). */
export const NA_PER_NACL = 0.393
