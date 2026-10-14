// Jämför AI-utläsningen mot kollegans facit. Kräver att dev-servern kör (npm run dev) och API-nyckel.
// Användning: node scripts/utvardera-utlasning.mjs [testdata-v2-katalog] [port]
// Kostar ett API-anrop per fil (11 st). Facit räknas från oavrundade värden, så små avrundningsskillnader
// i rapporter per kg vara (t.ex. koppar i B06) är väntade.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const kat = process.argv[2] ?? new URL('../../testdata/Testdata-from-other-dev/krubba-testdata-v2', import.meta.url).pathname
const port = process.argv[3] ?? '5173'
const facit = JSON.parse(readFileSync(join(kat, 'data/facit.json'), 'utf8')).analyser
const filer = [
  ...facit.map((a) => ({ id: a.id, fil: a.fil, facit: a })),
  ...['A01-medel-skord1', 'B04-hoga-socker-ho', 'B06-tredje-skord-hog-aska'].map((id) => ({
    id: id + ' (mobilfoto)', fil: `bilder/${id}-mobilfoto.jpg`, facit: facit.find((a) => a.id === id),
  })),
  { id: 'R00 (ska avvisas)', fil: 'pdf/R00-referens-sverigestatistik-2026.pdf', facit: null },
]
const MAP = { oe_hast: 'energi', smbrp_hast: 'smbRp', socker: 'socker' }
const MAKRO = { Ca: 'ca', P: 'p', Mg: 'mg', Na: 'na' }
const SPAR = { Fe: 'fe', Mn: 'mn', Zn: 'zn', Cu: 'cu', Se: 'se' }
const nara = (a, b) => a != null && Math.abs(a - b) <= Math.max(0.05 * Math.abs(b), b < 1 ? 0.011 : 0.15)

async function kor(f) {
  const data = readFileSync(join(kat, f.fil)).toString('base64')
  const mediaType = f.fil.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
  const t0 = Date.now()
  const res = await fetch('http://localhost:${port}/api/analys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mediaType, base64: data }) })
  const svar = await res.json()
  const sek = ((Date.now() - t0) / 1000).toFixed(1)
  if (!f.facit) return { id: f.id, sek, ok: svar.arAnalys === false, detalj: `arAnalys=${svar.arAnalys}` }
  const v = f.facit.forvantade_varden_per_kg_ts
  const forv = { tsProcent: v.ts_pct, askaGPerKgTs: v.aska }
  for (const [k, m] of Object.entries(MAP)) forv[m] = v[k]
  for (const [k, m] of Object.entries(MAKRO)) if (v.makro_g_per_kg_ts?.[k] != null) forv[m] = v.makro_g_per_kg_ts[k]
  for (const [k, m] of Object.entries(SPAR)) if (v.spar_mg_per_kg_ts?.[k] != null) forv[m] = v.spar_mg_per_kg_ts[k]
  const fel = []
  let ratt = 0
  for (const [k, forvantat] of Object.entries(forv)) {
    const fatt = k === 'tsProcent' || k === 'askaGPerKgTs' ? svar[k] : svar.perKgTs?.[k]
    if (nara(fatt, forvantat)) ratt++
    else fel.push(`${k}: fick ${fatt}, facit ${forvantat}`)
  }
  // Ämnen som inte står i rapporten ska vara null.
  for (const m of [...Object.values(MAKRO), ...Object.values(SPAR)]) {
    if (forv[m] === undefined && svar.perKgTs?.[m] != null) fel.push(`${m}: hittade på ${svar.perKgTs[m]}, ska vara null`)
  }
  return { id: f.id, sek, ok: fel.length === 0, ratt, totalt: Object.keys(forv).length, fel, typ: svar.typ, anm: svar.anmarkningar }
}

const resultat = []
for (let i = 0; i < filer.length; i += 4) resultat.push(...(await Promise.all(filer.slice(i, i + 4).map(kor))))
for (const r of resultat) {
  console.log(`${r.ok ? 'OK ' : 'FEL'} ${r.id} (${r.sek} s)${r.totalt ? ` ${r.ratt}/${r.totalt} värden, typ ${r.typ}` : ' ' + r.detalj}`)
  for (const f of r.fel ?? []) console.log('     ' + f)
}
