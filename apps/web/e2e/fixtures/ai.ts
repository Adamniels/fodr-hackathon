// Canned AI responses for e2e tests. Typed against the client contracts so they break when a contract changes.

import type { JournalAnalys, ProfilTolkning } from '../../src/api'
import type { UtlastAnalys } from '@fodr/domain/analysis'

/** Extraction of A01-medel-skord1.pdf, values from testdata/.../krubba-testdata-v2/data/facit.json. */
export const analysA01 = {
  arAnalys: true,
  typ: 'hosilage',
  labb: 'Labb A',
  provdatum: '2026-06-10',
  tsProcent: 39.7,
  askaGPerKgTs: 71,
  perKgTs: {
    energi: 10.2,
    energiIdisslare: null,
    smbRp: 104,
    raprotein: 150,
    ca: 5.3,
    p: 2.66,
    mg: 1.71,
    na: 0.83,
    fe: 180,
    mn: 58,
    cu: 6,
    zn: 32,
    co: null,
    jod: null,
    se: 0.03,
    socker: 61,
    starkelse: null,
  },
  anmarkningar: [],
} satisfies UtlastAnalys

export const profil = {
  grovfoderKgPerDag: null,
  grovfoderTyp: null,
  nuvarandeFoder: [],
  ras: null,
  prestanda: null,
  miljo: { hallning: null, timmarUtePerDag: null, klippt: null, tacke: null },
  fang: true,
  ems: false,
  ppid: false,
  magsar: false,
  pssm: false,
  luftvagar: false,
  tandproblem: false,
  proteinkanslig: false,
  undvik: [],
  ovrigt: '',
  foljdfragor: [],
} satisfies ProfilTolkning

export const FOLJDFRAGA = 'Hur mycket väger en liter av pelletsen?'

export const profilMedFoljdfraga = { ...profil, foljdfragor: [FOLJDFRAGA] } satisfies ProfilTolkning

export const forklaring = { text: 'E2E-förklaring: stycke ett.\nStycke två.' }

export const journal = {
  sammanfattning: 'E2E-sammanfattning av journalen.',
  monster: [{ iakttagelse: 'Lös mage efter bytet', mojligKoppling: 'Byte av hösilage', datum: '2026-09-28' }],
  veterinar: { behovs: true, skal: 'Ömma framhovar hos en häst med fånghistorik.' },
  nastaSteg: ['Väg hästen om fyra veckor'],
} satisfies JournalAnalys
