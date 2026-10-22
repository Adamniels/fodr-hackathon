// The landing page's plan preview (#29): a synthetic horse and analysis with realistic values, no real people. The
// preview is computed by the engine from these, so it shows what the app really does. Not used anywhere else.

import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'

export const demoHast: Hastprofil = {
  id: 'landing-sixten',
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
  // A01 has only 39.7 % dry matter, so it takes a lot of feed: 16 kg gives 6.4 kg DM.
  grovfoder: { typ: 'hosilage', kgPerDag: 16 },
  nuvarandeFoder: [{ produktId: 'gg-1235447', namn: 'Hästfoder Krafft Leisure Pellets 20kg', gramPerDag: 1000 }],
}

/** A01: the national average for mixed-ley silage, first cut. */
export const analysKomplett: Grovfoderanalys = {
  typ: 'hosilage',
  labb: 'Testlabb Alfa',
  provdatum: '2026-06-10',
  tsProcent: 39.7,
  askaGPerKgTs: 71,
  perKgTs: {
    energi: 10.2,
    smbRp: 104,
    socker: 61,
    ca: 5.3,
    p: 2.66,
    mg: 1.71,
    na: 0.83,
    fe: 180,
    mn: 58,
    zn: 32,
    cu: 6,
    se: 0.03,
  },
}
