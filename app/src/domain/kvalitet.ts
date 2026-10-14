// Bedömning av grovfodret i sig, oberoende av foderstaten. Gränser från SLU Rapport 289 där de finns,
// annars märkta med sin källa.

import type { Grovfoderanalys, Hastprofil } from './types'

export interface Kvalitetsflagga {
  niva: 'info' | 'varning'
  rubrik: string
  text: string
  kalla: string
}

const HART_ARBETE = new Set(['trav_galopp_traning', 'distans', 'tavling_hog'])

// SLU tabell 32: lämpliga grovfoderkvaliteter. Fölston och unghästar ingår inte i prototypen.
const TABELL_32 = {
  hart: { kvot: [5, 7], energiMin: 9, energiMax: undefined, namn: 'hästar i hårt arbete' },
  ovriga: { kvot: [5, 6], energiMin: 6.5, energiMax: 8, namn: 'hästar utan hårt arbete' },
} as const

// ANTAGANDE: gränser för jordinblandning enligt Eurofins tolkningsstöd, inte SLU.
const ASKA_JORD_G = 90
const JARN_JORD_MG = 250
// ANTAGANDE: sockergräns vid fång och EMS, branschpraxis (se plan.ts).
const SOCKER_HOGT_G = 100

const fmt = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })

export function bedomGrovfoder(analys: Grovfoderanalys, profil: Hastprofil): Kvalitetsflagga[] {
  const flaggor: Kvalitetsflagga[] = []
  const v = analys.perKgTs
  const kategori = HART_ARBETE.has(profil.prestanda ?? '') ? TABELL_32.hart : TABELL_32.ovriga

  if (v.energi && v.smbRp) {
    const kvot = v.smbRp / v.energi
    const [min, max] = kategori.kvot
    if (kvot > max) {
      flaggor.push({
        niva: 'info',
        rubrik: 'Mer protein än hästen behöver',
        text: `${fmt(kvot)} g smältbart protein per MJ, över ${min}–${max} som SLU rekommenderar för ${kategori.namn}. Överskottet blir kväve i gödseln. Passar bättre till unghästar och fölston.`,
        kalla: 'SLU tabell 32',
      })
    } else if (kvot < min) {
      flaggor.push({
        niva: 'varning',
        rubrik: 'Proteinfattigt grovfoder',
        text: `${fmt(kvot)} g smältbart protein per MJ, under ${min} som SLU rekommenderar. Proteinet kan behöva kompletteras.`,
        kalla: 'SLU tabell 32',
      })
    }
  }

  if (v.energi) {
    if (kategori.energiMax && v.energi > kategori.energiMax) {
      flaggor.push({
        niva: 'info',
        rubrik: 'Energirikt grovfoder',
        text: `${fmt(v.energi)} MJ per kg ts, över ${fmt(kategori.energiMin)}–${kategori.energiMax} som SLU rekommenderar för ${kategori.namn}. Fri tillgång kan ge överhull. Att blanda in halm eller välja en senare skörd sänker energin.`,
        kalla: 'SLU tabell 32',
      })
    } else if (v.energi < kategori.energiMin) {
      flaggor.push({
        niva: 'varning',
        rubrik: 'Energifattigt grovfoder',
        text: `${fmt(v.energi)} MJ per kg ts, under ${fmt(kategori.energiMin)} som SLU rekommenderar för ${kategori.namn}.`,
        kalla: 'SLU tabell 32',
      })
    }
  }

  if (analys.typ === 'hosilage') {
    if (analys.tsProcent < 45) {
      flaggor.push({
        niva: 'varning',
        rubrik: 'Blött hösilage',
        text: `Torrsubstans ${fmt(analys.tsProcent)} %, under 45–65 % som SLU rekommenderar för inplastat vallfoder till häst. Större risk för feljäsning och klostridier, och hästen behöver äta mycket vara. Kort hållbarhet efter öppning.`,
        kalla: 'SLU sid 30',
      })
    } else if (analys.tsProcent > 65) {
      flaggor.push({
        niva: 'varning',
        rubrik: 'Torrt hösilage',
        text: `Torrsubstans ${fmt(analys.tsProcent)} %, över 65 %. SLU anger förhöjd risk för mögel i inplastat vallfoder över 65–70 % ts.`,
        kalla: 'SLU sid 30',
      })
    }
  }

  const askaHog = analys.askaGPerKgTs !== undefined && analys.askaGPerKgTs > ASKA_JORD_G
  const jarnHogt = v.fe !== undefined && v.fe > JARN_JORD_MG
  if (askaHog || jarnHogt) {
    const delar = [
      askaHog && `aska ${fmt(analys.askaGPerKgTs!)} g`,
      jarnHogt && `järn ${fmt(v.fe!)} mg`,
    ].filter(Boolean)
    flaggor.push({
      niva: 'varning',
      rubrik: 'Möjlig jordinblandning',
      text: `Högt innehåll (${delar.join(' och ')} per kg ts) tyder på jord i fodret, vilket ökar risken för dålig hygienisk kvalitet.`,
      kalla: 'Eurofins tolkningsstöd (ej SLU)',
    })
  }

  if (v.socker !== undefined && v.socker > SOCKER_HOGT_G && !profil.halsa.fang && !profil.halsa.ems) {
    flaggor.push({
      niva: 'info',
      rubrik: 'Högt socker',
      text: `${fmt(v.socker)} g socker per kg ts. Olämpligt utan åtgärd, till exempel blötläggning, för hästar med fång eller EMS.`,
      kalla: 'Branschpraxis (ej SLU)',
    })
  }

  if (v.se === undefined) {
    flaggor.push({
      niva: 'info',
      rubrik: 'Selen ej analyserat',
      text: 'Svenska jordar är selenfattiga och tillskott behövs i de allra flesta fall. Planen räknar med ett lågt typvärde.',
      kalla: 'SLU sid 20',
    })
  }

  return flaggor
}
