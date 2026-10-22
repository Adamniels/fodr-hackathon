// Converts the stores' product files to the app's format (apps/api/src/data/products.json, #27), which
// `npm run products:import` then loads into the database the API plans from (#35).
// Usage: node scripts/import-products.mjs [source-dir]
// The selectable products and their doses come from scripts/produktval.json, which is reviewed by hand.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sourceDir = process.argv[2] ?? join(here, '../../../testdata/Testdata-from-other-dev')
const outFile = join(here, '../../api/src/data/products.json')

const NA_PER_NACL = 0.393
// SLU: SE × 0.86 ≈ OE (page 7).
const OE_PER_SE = 0.86

const granngarden = JSON.parse(readFileSync(join(sourceDir, 'granngarden-produkter.json'), 'utf8'))
const hooks = JSON.parse(readFileSync(join(sourceDir, 'hooks-produkter.json'), 'utf8'))
const selection = JSON.parse(readFileSync(join(here, 'produktval.json'), 'utf8')).produkter

const GG_NUTRIENTS = {
  ca_g: 'ca',
  p_g: 'p',
  mg_g: 'mg',
  na_g: 'na',
  fe_mg: 'fe',
  mn_mg: 'mn',
  cu_mg: 'cu',
  zn_mg: 'zn',
  co_mg: 'co',
  i_mg: 'jod',
  se_mg: 'se',
  vit_a_ie: 'vitA',
  vit_d3_ie: 'vitD',
  vit_e_mg: 'vitE',
  vit_b1_mg: 'b1',
  vit_b2_mg: 'b2',
  biotin_mg: 'biotin',
  socker_g: 'socker',
  starkelse_g: 'starkelse',
  smb_raprotein_g: 'smbRp',
}

const HK_NUTRIENTS = {
  kalcium_procent: ['ca', 10],
  fosfor_procent: ['p', 10],
  magnesium_procent: ['mg', 10],
  natrium_procent: ['na', 10],
  socker_procent: ['socker', 10],
  starkelse_procent: ['starkelse', 10],
  energi_mj_per_kg: ['energi', 1],
  selen_mg_per_kg: ['se', 1],
  zink_mg_per_kg: ['zn', 1],
  koppar_mg_per_kg: ['cu', 1],
  vitamin_e_mg_per_kg: ['vitE', 1],
  vitamin_a_ie_per_kg: ['vitA', 1],
  vitamin_d3_ie_per_kg: ['vitD', 1],
}

const CATEGORY = {
  mineralfoder: 'mineralfoder',
  mineraltillskott: 'tillskott',
  vitamintillskott: 'tillskott',
  'vitamin- och mineraltillskott': 'tillskott',
  mineraltillskott_enskilt: 'tillskott',
  elektrolyter: 'tillskott',
  kraftfoder: 'kraftfoder',
  mash: 'kraftfoder',
  'fiberfoder/grovfoderkomplement': 'kraftfoder',
  'olja/energi': 'kraftfoder',
  foderråvara: 'kraftfoder',
  grovfoderersattning: 'kraftfoder',
  olja: 'kraftfoder',
  proteinfoder: 'proteinfoder',
}

function ggNutrients(p, antaganden) {
  const n = p.naring_per_kg ?? {}
  const nutrients = {}
  for (const [from, to] of Object.entries(GG_NUTRIENTS)) if (n[from] != null) nutrients[to] = n[from]
  if (nutrients.na === undefined && n.nacl_g != null) nutrients.na = n.nacl_g * NA_PER_NACL
  if (n.me_mj != null) nutrients.energi = n.me_mj
  else if (n.energi_mj_ospec != null) {
    nutrients.energi = n.energi_mj_ospec
    antaganden.push('Energin saknar angiven typ och räknas som omsättbar energi (OE).')
  } else if (n.de_mj != null) {
    nutrients.energi = round(n.de_mj * OE_PER_SE, 2)
    antaganden.push('Energin är angiven som smältbar energi och räknad om till OE med SLU:s faktor 0,86.')
  }
  return nutrients
}

function hkNutrients(p) {
  const n = p.naring_per_kg ?? {}
  const nutrients = {}
  for (const [from, [to, factor]] of Object.entries(HK_NUTRIENTS)) if (n[from] != null) nutrients[to] = n[from] * factor
  return nutrients
}

const NO_GRAIN = /spannmålsfri|utan spannmål|oat ?free|grain ?free|havrefri|utan havre/
const NO_MOLASSES = /utan (tillsatt )?melass|melassfri/
function ingredienser(text) {
  const t = text.toLowerCase()
  const found = []
  if (/melass/.test(t) && !NO_MOLASSES.test(t)) found.push('melass')
  if (/lusern|lucern|alfalfa/.test(t)) found.push('lusern')
  if (/\bsoja|soy/.test(t)) found.push('soja')
  if (/havre|\bkorn\b|vete|majs|spannmål|cereal|\boat/.test(t) && !NO_GRAIN.test(t)) found.push('spannmål')
  if (/betfiber|beet|betmassa/.test(t)) found.push('betfiber')
  if (/linfrö|linseed/.test(t)) found.push('linfrö')
  return found
}

function form(p) {
  const f = p.produktinfo?.form?.toLowerCase()
  if (f) return f
  const t = p.namn.toLowerCase()
  for (const [pattern, name] of [
    [/pellets|nuggets/, 'pellets'],
    [/müsli|muesli/, 'müsli'],
    [/mash/, 'mash'],
    [/pulver|powder|krita/, 'pulver'],
    [/flytande|\d+(,\d+)?l\b|\bml\b/, 'flytande'],
    [/brikett|30-p/, 'brikett'],
    [/balja|hink/, 'hink'],
    [/sten/, 'sten'],
  ])
    if (pattern.test(t)) return name
  return undefined
}

function lamplighetFangEms(kategori, nutrients) {
  // ANTAGANDE: under about 100 g sugar plus starch per kg counts as suitable for laminitis and EMS.
  // Pure mineral, vitamin and salt products count as suitable unless declared otherwise.
  const carbs = (nutrients.socker ?? 0) + (nutrients.starkelse ?? 0)
  const known = nutrients.socker !== undefined || nutrients.starkelse !== undefined
  if (known) return carbs <= 100
  return ['mineralfoder', 'tillskott', 'salt'].includes(kategori)
}

function buildProduct({
  id,
  namn,
  marke,
  storeType,
  amount,
  price,
  url,
  description,
  naringsdata,
  kontrollera,
  butik,
  nutrients,
  antaganden,
  p,
}) {
  const v = selection[id]
  let kategori = v?.kategori ?? CATEGORY[storeType] ?? 'ovrigt'
  if (storeType === 'salt/slicksten' || storeType === 'saltsten' || storeType === 'slicksten')
    kategori = v?.kategori ?? 'ovrigt'
  let perKg = { ...nutrients, ...(v?.perKg ?? {}) }
  if (v?.perKgFranAnnanBas) {
    const base = p.naring_annan_bas?.[v.perKgFranAnnanBas.bas]
    if (!base) throw new Error(`${id}: saknar annan bas ${v.perKgFranAnnanBas.bas}`)
    const factor = 1000 / v.perKgFranAnnanBas.gram
    const from = {}
    for (const [k, x] of Object.entries(base)) if (GG_NUTRIENTS[k]) from[GG_NUTRIENTS[k]] = round(x * factor, 3)
    perKg = { ...perKg, ...from }
    antaganden.push(`Halter räknade från deklarationen per ${v.perKgFranAnnanBas.bas}.`)
  }
  return {
    id,
    namn,
    marke: marke ?? '',
    kategori,
    perKg,
    prisKr: price,
    forpackningKg: round(amount / 1000, 3),
    ...(v ? { dosGramPer100kg: { min: v.dos[0], max: v.dos[1] }, dosKalla: v.dosKalla } : {}),
    iUrval: Boolean(v),
    lampligVidFangEms: lamplighetFangEms(kategori, perKg),
    ingredienser: ingredienser(`${namn} ${description ?? ''}`),
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
  if (!RELEVANT.has(p.relevans_for_krubba) && !selection[p.id]) continue
  if (!p.mangd_g_eller_ml || !p.pris_kr) continue
  const antaganden = []
  if (/\d+(,\d+)?l\b/i.test(p.forpackning ?? ''))
    antaganden.push('Flytande produkt: 1 ml räknas som 1 g för pris och dos.')
  produkter.push(
    buildProduct({
      id: p.id,
      namn: p.namn,
      marke: p.varumarke,
      storeType: p.typ,
      amount: p.mangd_g_eller_ml,
      price: p.pris_kr,
      url: p.url,
      description: p.beskrivning,
      naringsdata: p.naringsdata,
      kontrollera: p.kontrollera,
      butik: 'Granngården',
      nutrients: ggNutrients(p, antaganden),
      antaganden,
      p,
    }),
  )
}

for (const p of hooks.produkter) {
  if (!RELEVANT.has(p.relevans_for_krubba) && !selection[p.id]) continue
  if (p.typ === 'tillbehor_ej_foder' || !p.mangd_g_eller_ml || !p.pris_kr) continue
  produkter.push(
    buildProduct({
      id: p.id,
      namn: p.namn,
      marke: p.varumarke,
      storeType: p.typ,
      amount: p.mangd_g_eller_ml,
      price: p.pris_kr,
      url: p.url,
      description: p.beskrivning,
      naringsdata: p.naringsdata,
      kontrollera: null,
      butik: 'Hööks',
      nutrients: hkNutrients(p),
      antaganden: [],
      p,
    }),
  )
}

const missing = Object.keys(selection).filter((id) => !produkter.some((p) => p.id === id))
if (missing.length) throw new Error(`Urvalsprodukter saknas i källan: ${missing.join(', ')}`)

produkter.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
writeFileSync(outFile, JSON.stringify(produkter, null, 1) + '\n')
const selected = produkter.filter((p) => p.iUrval)
console.log(`${produkter.length} produkter skrivna till ${outFile}, varav ${selected.length} i urvalet.`)
for (const p of selected) console.log(`  ${p.kategori.padEnd(12)} ${p.namn} (${Object.keys(p.perKg).join(', ')})`)

function round(n, d) {
  const f = 10 ** d
  return Math.round(n * f) / f
}
