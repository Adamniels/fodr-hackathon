// Frozen horse profiles for the API tests (the body a client sends: a Hastprofil without id).
import type { HorseProfile } from '@fodr/contracts/horses'

export const SIXTEN: HorseProfile = {
  namn: 'Sixten',
  alderAr: 12,
  kon: 'valack',
  typ: 'normalfodd',
  viktKg: 550,
  hull: 7,
  ras: 'varmblod_rid',
  ridning: { passPerVecka: 4, minuterPerPass: 60, travGaloppMinPerPass: 15 },
  prestanda: 'fritid',
  miljo: { hallning: 'box', timmarUtePerDag: 8, klippt: false, tacke: true, lagstaTempC: -10 },
  halsa: { fang: true, ems: false, ovrigt: 'Fång för två år sedan.' },
  grovfoder: { typ: 'hosilage', kgPerDag: 16 },
  nuvarandeFoder: [{ produktId: 'gg-1235447', namn: 'Pellets', gramPerDag: 1000 }],
}

export const PYSEN: HorseProfile = {
  namn: 'Pysen',
  alderAr: 22,
  kon: 'sto',
  typ: 'lattfodd',
  viktKg: 280,
  hull: 5,
  ras: 'islandshast',
  arbetsniva: 'latt',
  halsa: { fang: false, ems: true, ovrigt: '' },
  grovfoder: { typ: 'ho', kgPerDag: 6 },
  nuvarandeFoder: [],
}
