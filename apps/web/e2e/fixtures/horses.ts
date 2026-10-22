// Horses the e2e tests seed through the API (#25), with the demo horses' values so the expected plans stay the same.
// Typed against the contract, so they break when it changes.

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
  halsa: { fang: true, ems: false, ovrigt: 'Fång för två år sedan, inga besvär sedan dess.' },
  grovfoder: { typ: 'hosilage', kgPerDag: 16 },
  nuvarandeFoder: [{ produktId: 'gg-1235447', namn: 'Hästfoder Krafft Leisure Pellets 20kg', gramPerDag: 1000 }],
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
  prestanda: 'fritid',
  miljo: { hallning: 'losdrift', timmarUtePerDag: 24, klippt: false, tacke: false, lagstaTempC: -20 },
  halsa: { fang: false, ems: true, ovrigt: '' },
  grovfoder: { typ: 'ho', kgPerDag: 6 },
  nuvarandeFoder: [],
}
