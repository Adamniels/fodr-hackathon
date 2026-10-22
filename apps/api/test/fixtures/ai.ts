// Valid requests to the AI routes (#30), as the web sends them: small, with every required field.
import type { ExplanationRequest, JournalRequest, ProfileRequest } from '@fodr/contracts/ai'

const halsa = { fang: true, ems: false, ovrigt: '' }

export const PROFILE_REQUEST: ProfileRequest = {
  foderText: 'Hö, två mål om dagen',
  halsaText: '',
  tidigareSvar: [],
  produkter: [{ id: 'p1', namn: 'Mineral' }],
}

export const EXPLANATION_REQUEST: ExplanationRequest = {
  hast: { namn: 'Sixten', alder: 12, viktKg: 550, hull: 7, halsa, ovrigt: '' },
  grovfoder: { typ: 'hosilage', kgPerDag: 16 },
  nulageMedDagensFoder: [],
  atgarder: ['Ge mineralfoder.'],
  efterForslaget: [{ amne: 'Energi', behov: 65, tillfort: 66, enhet: 'MJ', status: 'ok', uppskattat: false }],
  kostnadMedForslagetKrPerManad: 88,
  kostnadIdagKrPerManad: 120,
  alternativ: null,
  byten: [],
  kvaveOverskottKgPerAr: 3,
  omGrovfodret: [],
  kansligheter: [],
  bortvaldaProdukter: [],
  varningar: [],
  foderbyte: { dagar: 14, steg: 4 },
  saknasIAnalysen: [],
}

export const JOURNAL_REQUEST: JournalRequest = {
  hast: { namn: 'Sixten', alderAr: 12, ras: null, viktKg: 550, hull: 7, halsa },
  poster: [{ id: 'e1', datum: '2026-10-01', viktKg: 545, text: 'Pigg' }],
  trend: { uppfoljningForfallen: false, varningar: [] },
  aktuellPlan: null,
}
