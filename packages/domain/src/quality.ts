// Bedömning av grovfodret i sig, oberoende av foderstaten. Gränser från SLU Rapport 289 där de finns,
// annars märkta med sin källa.

import type { Kallhanvisning, QualityMessage, QualityTitle, Tabell32Grupp } from './messages'
import { kraverLagSockerStarkelse } from './sensitivity'
import type { Grovfoderanalys, Hastprofil } from './types'

export interface Kvalitetsflagga {
  niva: 'info' | 'varning'
  rubrik: QualityTitle
  text: QualityMessage
  kalla: Kallhanvisning
}

const HART_ARBETE = new Set(['trav_galopp_traning', 'distans', 'tavling_hog'])

// SLU tabell 32: lämpliga grovfoderkvaliteter. Fölston och unghästar ingår inte i prototypen.
const TABELL_32 = {
  hart: { kvot: [5, 7], energiMin: 9, energiMax: undefined },
  ovriga: { kvot: [5, 6], energiMin: 6.5, energiMax: 8 },
} as const

// ANTAGANDE: gränser för jordinblandning enligt Eurofins tolkningsstöd, inte SLU.
const ASKA_JORD_G = 90
const JARN_JORD_MG = 250
// ANTAGANDE: sockergräns vid fång, EMS, PPID och korsförlamning, branschpraxis (se plan.ts).
const SOCKER_HOGT_G = 100

const TABELL_32_KALLA: Kallhanvisning = { code: 'source.table32', params: {} }
const SID_30: Kallhanvisning = { code: 'source.page30', params: {} }

export function bedomGrovfoder(analys: Grovfoderanalys, profil: Hastprofil): Kvalitetsflagga[] {
  const flaggor: Kvalitetsflagga[] = []
  const v = analys.perKgTs
  const grupp: Tabell32Grupp = HART_ARBETE.has(profil.prestanda ?? '') ? 'hart' : 'ovriga'
  const kategori = TABELL_32[grupp]

  if (v.energi && v.smbRp) {
    const kvot = v.smbRp / v.energi
    const [min, max] = kategori.kvot
    if (kvot > max) {
      flaggor.push({
        niva: 'info',
        rubrik: { code: 'qualityTitle.proteinHigh', params: {} },
        text: { code: 'quality.proteinHigh', params: { ratio: kvot, min, max, group: grupp } },
        kalla: TABELL_32_KALLA,
      })
    } else if (kvot < min) {
      flaggor.push({
        niva: 'varning',
        rubrik: { code: 'qualityTitle.proteinLow', params: {} },
        text: { code: 'quality.proteinLow', params: { ratio: kvot, min } },
        kalla: TABELL_32_KALLA,
      })
    }
  }

  if (v.energi) {
    if (kategori.energiMax && v.energi > kategori.energiMax) {
      flaggor.push({
        niva: 'info',
        rubrik: { code: 'qualityTitle.energyHigh', params: {} },
        text: {
          code: 'quality.energyHigh',
          params: { mj: v.energi, min: kategori.energiMin, max: kategori.energiMax, group: grupp },
        },
        kalla: TABELL_32_KALLA,
      })
    } else if (v.energi < kategori.energiMin) {
      flaggor.push({
        niva: 'varning',
        rubrik: { code: 'qualityTitle.energyLow', params: {} },
        text: { code: 'quality.energyLow', params: { mj: v.energi, min: kategori.energiMin, group: grupp } },
        kalla: TABELL_32_KALLA,
      })
    }
  }

  if (analys.typ === 'hosilage') {
    if (analys.tsProcent < 45) {
      flaggor.push({
        niva: 'varning',
        rubrik: { code: 'qualityTitle.haylageWet', params: {} },
        text: { code: 'quality.haylageWet', params: { dmPercent: analys.tsProcent } },
        kalla: SID_30,
      })
    } else if (analys.tsProcent > 65) {
      flaggor.push({
        niva: 'varning',
        rubrik: { code: 'qualityTitle.haylageDry', params: {} },
        text: { code: 'quality.haylageDry', params: { dmPercent: analys.tsProcent } },
        kalla: SID_30,
      })
    }
  }

  const aska = analys.askaGPerKgTs !== undefined && analys.askaGPerKgTs > ASKA_JORD_G ? analys.askaGPerKgTs : undefined
  const jarn = v.fe !== undefined && v.fe > JARN_JORD_MG ? v.fe : undefined
  const jord: QualityMessage | undefined =
    aska !== undefined && jarn !== undefined
      ? { code: 'quality.soilAshIron', params: { ashG: aska, ironMg: jarn } }
      : aska !== undefined
        ? { code: 'quality.soilAsh', params: { ashG: aska } }
        : jarn !== undefined
          ? { code: 'quality.soilIron', params: { ironMg: jarn } }
          : undefined
  if (jord) {
    flaggor.push({
      niva: 'varning',
      rubrik: { code: 'qualityTitle.soil', params: {} },
      text: jord,
      kalla: { code: 'source.eurofinsSoil', params: {} },
    })
  }

  // General advice for a horse without the low sugar rule; one with it gets the plan's warning instead (C5).
  if (v.socker !== undefined && v.socker > SOCKER_HOGT_G && !kraverLagSockerStarkelse(profil.halsa)) {
    flaggor.push({
      niva: 'info',
      rubrik: { code: 'qualityTitle.sugarHigh', params: {} },
      text: { code: 'quality.sugarHigh', params: { sugarG: v.socker } },
      kalla: { code: 'source.industryPractice', params: {} },
    })
  }

  if (v.se === undefined) {
    flaggor.push({
      niva: 'info',
      rubrik: { code: 'qualityTitle.seleniumMissing', params: {} },
      text: { code: 'quality.seleniumMissing', params: {} },
      kalla: { code: 'source.page20', params: {} },
    })
  }

  return flaggor
}
