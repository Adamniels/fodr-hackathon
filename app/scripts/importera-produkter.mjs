// Gör om butikernas produktfiler till appens format (src/data/products.json).
// Körs: node scripts/importera-produkter.mjs [källkatalog]
// Urvalsprodukter och deras doser styrs av scripts/produktval.json, som granskas för hand.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const har = dirname(fileURLToPath(import.meta.url))
const kalla = process.argv[2] ?? join(har, '../../testdata/Testdata-from-other-dev')
const ut = join(har, '../src/data/products.json')

const NA_PER_NACL = 0.393
// SLU: SE × 0,86 ≈ OE (sid 7).
const OE_PER_SE = 0.86

const granngarden = JSON.parse(readFileSync(join(kalla, 'granngarden-produkter.json'), 'utf8'))
const hooks = JSON.parse(readFileSync(join(kalla, 'hooks-produkter.json'), 'utf8'))
const val = JSON.parse(readFileSync(join(har, 'produktval.json'), 'utf8')).produkter

const GG_AMNEN = {
  ca_g: 'ca', p_g: 'p', mg_g: 'mg', na_g: 'na',
  fe_mg: 'fe', mn_mg: 'mn', cu_mg: 'cu', zn_mg: 'zn', co_mg: 'co', i_mg: 'jod', se_mg: 'se',
  vit_a_ie: 'vitA', vit_d3_ie: 'vitD', vit_e_mg: 'vitE', vit_b1_mg: 'b1', vit_b2_mg: 'b2', biotin_mg: 'biotin',
  socker_g: 'socker', starkelse_g: 'starkelse', smb_raprotein_g: 'smbRp',
}

const HK_AMNEN = {
  kalcium_procent: ['ca', 10], fosfor_procent: ['p', 10], magnesium_procent: ['mg', 10], natrium_procent: ['na', 10],
  socker_procent: ['socker', 10], starkelse_procent: ['starkelse', 10], energi_mj_per_kg: ['energi', 1],
  selen_mg_per_kg: ['se', 1], zink_mg_per_kg: ['zn', 1], koppar_mg_per_kg: ['cu', 1],
  vitamin_e_mg_per_kg: ['vitE', 1], vitamin_a_ie_per_kg: ['vitA', 1], vitamin_d3_ie_per_kg: ['vitD', 1],
}

const KATEGORI = {
  mineralfoder: 'mineralfoder',
  mineraltillskott: 'tillskott', vitamintillskott: 'tillskott', 'vitamin- och mineraltillskott': 'tillskott',
  mineraltillskott_enskilt: 'tillskott', elektrolyter: 'tillskott',
  kraftfoder: 'kraftfoder', mash: 'kraftfoder', 'fiberfoder/grovfoderkomplement': 'kraftfoder', 'olja/energi': 'kraftfoder',
  foderråvara: 'kraftfoder', grovfoderersattning: 'kraftfoder', olja: 'kraftfoder',
  proteinfoder: 'proteinfoder',
}

function ggNaring(p, antaganden) {
  const n = p.naring_per_kg ?? {}
  const per = {}
  for (const [fran, till] of Object.entries(GG_AMNEN)) if (n[fran] != null) per[till] = n[fran]
  if (per.na === undefined && n.nacl_g != null) per.na = n.nacl_g * NA_PER_NACL
  if (n.me_mj != null) per.energi = n.me_mj
  else if (n.energi_mj_ospec != null) {
    per.energi = n.energi_mj_ospec
    antaganden.push('Energin saknar angiven typ och räknas som omsättbar energi (OE).')
  } else if (n.de_mj != null) {
    per.energi = round(n.de_mj * OE_PER_SE, 2)
    antaganden.push('Energin är angiven som smältbar energi och räknad om till OE med SLU:s faktor 0,86.')
  }
  return per
}

function hkNaring(p) {
  const n = p.naring_per_kg ?? {}
  const per = {}
  for (const [fran, [till, faktor]] of Object.entries(HK_AMNEN)) if (n[fran] != null) per[till] = n[fran] * faktor
  return per
}

const NEJ_SPANNMAL = /spannmålsfri|utan spannmål|oat ?free|grain ?free|havrefri|utan havre/
const NEJ_MELASS = /utan (tillsatt )?melass|melassfri/
function ingredienser(text) {
  const t = text.toLowerCase()
  const ut = []
  if (/melass/.test(t) && !NEJ_MELASS.test(t)) ut.push('melass')
  if (/lusern|lucern|alfalfa/.test(t)) ut.push('lusern')
  if (/\bsoja|soy/.test(t)) ut.push('soja')
  if (/havre|\bkorn\b|vete|majs|spannmål|cereal|\boat/.test(t) && !NEJ_SPANNMAL.test(t)) ut.push('spannmål')
  if (/betfiber|beet|betmassa/.test(t)) ut.push('betfiber')
  if (/linfrö|linseed/.test(t)) ut.push('linfrö')
  return ut
}

function form(p) {
  const f = p.produktinfo?.form?.toLowerCase()
  if (f) return f
  const t = p.namn.toLowerCase()
  for (const [mönster, namn] of [
    [/pellets|nuggets/, 'pellets'], [/müsli|muesli/, 'müsli'], [/mash/, 'mash'], [/pulver|powder|krita/, 'pulver'],
    [/flytande|\d+(,\d+)?l\b|\bml\b/, 'flytande'], [/brikett|30-p/, 'brikett'], [/balja|hink/, 'hink'], [/sten/, 'sten'],
  ]) if (mönster.test(t)) return namn
  return undefined
}

function lamplighetFangEms(kategori, per) {
  // ANTAGANDE: under ca 100 g socker plus stärkelse per kg räknas som lämpligt vid fång och EMS.
  // Rena mineral-, vitamin- och saltprodukter räknas som lämpliga om inget annat är deklarerat.
  const kolhydrat = (per.socker ?? 0) + (per.starkelse ?? 0)
  const kand = per.socker !== undefined || per.starkelse !== undefined
  if (kand) return kolhydrat <= 100
  return ['mineralfoder', 'tillskott', 'salt'].includes(kategori)
}

function bygg({ id, namn, marke, typ, mangd, pris, url, beskrivning, naringsdata, kontrollera, butik, per, antaganden, p }) {
  const v = val[id]
  let kategori = v?.kategori ?? KATEGORI[typ] ?? 'ovrigt'
  if (typ === 'salt/slicksten' || typ === 'saltsten' || typ === 'slicksten') kategori = v?.kategori ?? 'ovrigt'
  let perKg = { ...per, ...(v?.perKg ?? {}) }
  if (v?.perKgFranAnnanBas) {
    const bas = p.naring_annan_bas?.[v.perKgFranAnnanBas.bas]
    if (!bas) throw new Error(`${id}: saknar annan bas ${v.perKgFranAnnanBas.bas}`)
    const faktor = 1000 / v.perKgFranAnnanBas.gram
    const fran = {}
    for (const [k, x] of Object.entries(bas)) if (GG_AMNEN[k]) fran[GG_AMNEN[k]] = round(x * faktor, 3)
    perKg = { ...perKg, ...fran }
    antaganden.push(`Halter räknade från deklarationen per ${v.perKgFranAnnanBas.bas}.`)
  }
  return {
    id,
    namn,
    marke: marke ?? '',
    kategori,
    perKg,
    prisKr: pris,
    forpackningKg: round(mangd / 1000, 3),
    ...(v ? { dosGramPer100kg: { min: v.dos[0], max: v.dos[1] }, dosKalla: v.dosKalla } : {}),
    iUrval: Boolean(v),
    lampligVidFangEms: lamplighetFangEms(kategori, perKg),
    ingredienser: ingredienser(`${namn} ${beskrivning ?? ''}`),
    form: form(p),
    naringsdata,
    ...(kontrollera?.length ? { kontrollera } : {}),
    antaganden: [...antaganden, ...(v?.antaganden ?? [])],
    butik,
    url,
    kalla: `${butik}, ${url}`,
    insamlad: '2026-10-14',
  }
}

const RELEVANT = new Set(['hög', 'medel', 'hog'])
const produkter = []

for (const p of granngarden.produkter) {
  if (!RELEVANT.has(p.relevans_for_krubba) && !val[p.id]) continue
  if (!p.mangd_g_eller_ml || !p.pris_kr) continue
  const antaganden = []
  if (/\d+(,\d+)?l\b/i.test(p.forpackning ?? '')) antaganden.push('Flytande produkt: 1 ml räknas som 1 g för pris och dos.')
  produkter.push(bygg({
    id: p.id, namn: p.namn, marke: p.varumarke, typ: p.typ, mangd: p.mangd_g_eller_ml, pris: p.pris_kr, url: p.url,
    beskrivning: p.beskrivning, naringsdata: p.naringsdata, kontrollera: p.kontrollera, butik: 'Granngården',
    per: ggNaring(p, antaganden), antaganden, p,
  }))
}

for (const p of hooks.produkter) {
  if (!RELEVANT.has(p.relevans_for_krubba) && !val[p.id]) continue
  if (p.typ === 'tillbehor_ej_foder' || !p.mangd_g_eller_ml || !p.pris_kr) continue
  produkter.push(bygg({
    id: p.id, namn: p.namn, marke: p.varumarke, typ: p.typ, mangd: p.mangd_g_eller_ml, pris: p.pris_kr, url: p.url,
    beskrivning: p.beskrivning, naringsdata: p.naringsdata, kontrollera: null, butik: 'Hööks',
    per: hkNaring(p), antaganden: [], p,
  }))
}

const saknade = Object.keys(val).filter((id) => !produkter.some((p) => p.id === id))
if (saknade.length) throw new Error(`Urvalsprodukter saknas i källan: ${saknade.join(', ')}`)

produkter.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
writeFileSync(ut, JSON.stringify(produkter, null, 1) + '\n')
const urval = produkter.filter((p) => p.iUrval)
console.log(`${produkter.length} produkter skrivna till ${ut}, varav ${urval.length} i urvalet.`)
for (const p of urval) console.log(`  ${p.kategori.padEnd(12)} ${p.namn} (${Object.keys(p.perKg).join(', ')})`)

function round(n, d) {
  const f = 10 ** d
  return Math.round(n * f) / f
}
