// Näringsämnen som modellen hanterar. Behov och tillförsel uttrycks alltid per häst och dag
// i enheten nedan. Fodervärden anges per kg torrsubstans (grovfoder) eller per kg foder (produkter).

export const NUTRIENTS = {
  energi: { label: 'Energi', unit: 'MJ', group: 'energi' },
  smbRp: { label: 'Smältbart råprotein', unit: 'g', group: 'energi' },
  ca: { label: 'Kalcium (Ca)', unit: 'g', group: 'makro' },
  p: { label: 'Fosfor (P)', unit: 'g', group: 'makro' },
  mg: { label: 'Magnesium (Mg)', unit: 'g', group: 'makro' },
  na: { label: 'Natrium (Na)', unit: 'g', group: 'makro' },
  fe: { label: 'Järn (Fe)', unit: 'mg', group: 'mikro' },
  mn: { label: 'Mangan (Mn)', unit: 'mg', group: 'mikro' },
  cu: { label: 'Koppar (Cu)', unit: 'mg', group: 'mikro' },
  zn: { label: 'Zink (Zn)', unit: 'mg', group: 'mikro' },
  co: { label: 'Kobolt (Co)', unit: 'mg', group: 'mikro' },
  jod: { label: 'Jod (I)', unit: 'mg', group: 'mikro' },
  se: { label: 'Selen (Se)', unit: 'mg', group: 'mikro' },
  vitA: { label: 'Vitamin A', unit: 'IE', group: 'vitamin' },
  vitD: { label: 'Vitamin D', unit: 'IE', group: 'vitamin' },
  vitE: { label: 'Vitamin E', unit: 'mg', group: 'vitamin' },
  b1: { label: 'Vitamin B1', unit: 'mg', group: 'vitamin' },
  b2: { label: 'Vitamin B2', unit: 'mg', group: 'vitamin' },
  biotin: { label: 'Biotin', unit: 'mg', group: 'vitamin' },
  socker: { label: 'Socker', unit: 'g', group: 'kolhydrat' },
  starkelse: { label: 'Stärkelse', unit: 'g', group: 'kolhydrat' },
} as const

export type NutrientKey = keyof typeof NUTRIENTS
export const NUTRIENT_KEYS = Object.keys(NUTRIENTS) as NutrientKey[]

/** Halter för ett foder. Ett saknat värde betyder okänt, aldrig noll. */
export type NutrientValues = Partial<Record<NutrientKey, number>>

/** Koksalt är 39,3 % natrium (SLU avrundar till 40 %). */
export const NA_PER_NACL = 0.393
