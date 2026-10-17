import { useEffect, useMemo, useState } from 'react'
import { forklaraPlan } from '../api'
import { kostnadPerManad, visningsnamn } from '@fodr/domain/intake'
import type { Balansrad, Plan, Status } from '@fodr/domain/plan'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { enhet, etikett, kr, tal } from '../format'
import { avtryck, laddaForklaring, sparaForklaring } from '../storage'
import { Injusteringskalender } from './Injusteringskalender'

const STATUS: Record<Status, [string, string]> = {
  brist: ['Brist', 'brist'],
  ok: ['Täckt', 'ok'],
  overskott: ['Överskott', 'varn'],
  over_max: ['Över maxgräns', 'brist'],
  okand: ['Okänt', 'okand'],
  osaker: ['Osäkert', 'okand'],
  ej_krav: ['', 'okand'],
}

export function PlanStep({
  hast,
  analys,
  plan,
  onSparaIJournal,
}: {
  hast: Hastprofil
  analys: Grovfoderanalys
  plan: Plan
  onSparaIJournal: () => void
}) {
  // Förklaringen sparas per häst och underlag. Samma plan visar den sparade texten i stället för
  // att fråga Claude igen; bara en ändrad plan (eller knappen "Skriv om") ger ett nytt anrop.
  const forklaringsUnderlag = useMemo(() => underlag(hast, analys, plan), [hast, analys, plan])
  const nyckel = useMemo(() => avtryck(JSON.stringify(forklaringsUnderlag)), [forklaringsUnderlag])
  const [forklaring, setForklaring] = useState<string | null>(() => laddaForklaring(hast.id, nyckel))
  const [forklaringFel, setForklaringFel] = useState<string | null>(null)
  const [omgang, setOmgang] = useState(0)

  useEffect(() => {
    const sparad = omgang === 0 ? laddaForklaring(hast.id, nyckel) : null
    setForklaringFel(null)
    if (sparad) {
      setForklaring(sparad)
      return
    }
    let avbruten = false
    setForklaring(null)
    forklaraPlan(forklaringsUnderlag)
      .then((r) => {
        sparaForklaring(hast.id, nyckel, r.text)
        if (!avbruten) setForklaring(r.text)
      })
      .catch((e) => !avbruten && setForklaringFel(e instanceof Error ? e.message : String(e)))
    return () => {
      avbruten = true
    }
  }, [hast.id, nyckel, forklaringsUnderlag, omgang])

  const u = plan.urval
  const nyKostnad = u?.kostnadPerManad ?? 0
  const behallnaKostnad = plan.behallnaFoder.reduce((s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag), 0)
  const totalNy = nyKostnad + behallnaKostnad
  const besparing = plan.nulageKostnadPerManad - totalNy
  // "Kalcium (Ca)" blir "kalcium", men "Vitamin E" behåller sin bokstav.
  const kortNamn = (r: Balansrad) =>
    etikett(r.amne)
      .replace(/\s*\(.*\)$/, '')
      .replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase())
  const nulageBrister = plan.nulage.filter((r) => r.status === 'brist').map(kortNamn)
  const nulageEnergi = plan.nulage.find((r) => r.amne === 'energi')!
  const energiProcent = Math.round((nulageEnergi.intag / nulageEnergi.behovMin! - 1) * 100)
  const ersatter = (id: string) => {
    const namn = plan.byten.filter((x) => x.till.produkt.id === id).map((x) => visningsnamn(x.fran.produkt))
    return namn.length ? namn.join(' och ') : undefined
  }
  const inkop = [...plan.behallnaFoder, ...(u?.poster ?? [])]

  return (
    <div className="plan">
      <header className="plan-topp">
        <h2>Foderplan för {hast.namn}</h2>
        <div className="kostnadsrad" aria-label="Kostnad per månad">
          <span className="kostnadsrad-belopp">{kr(totalNy)}/mån</span>
          {plan.nulageKostnadPerManad > 0 && (
            <span className={`kostnadsrad-jmf ${besparing >= 0 ? 'ok' : ''}`}>
              {besparing >= 0 ? `${kr(besparing)} billigare` : `${kr(-besparing)} dyrare`} än i dag
            </span>
          )}
        </div>
      </header>

      <div className="plan-huvud">
        <section className="kort">
          <h3>Gör så här</h3>
          <ol className="atgarder">
            <li>
              Ge {tal(plan.grovfoderKgPerDag, 1)} kg {analys.typ === 'hosilage' ? 'hösilage' : 'hö'} per dag.
            </li>
            {plan.atgarder.map((a) => (
              <li key={a.text} className={a.typ}>
                {a.text}
              </li>
            ))}
          </ol>
          {plan.varningar.length > 0 && (
            <div className="ruta varn">
              {plan.varningar.map((v) => (
                <p key={v}>{v}</p>
              ))}
            </div>
          )}
          <Injusteringskalender injustering={plan.injustering} hastNamn={hast.namn} />
        </section>

        <section className="kort forklaring">
          <h3>
            <span className="ai-bricka">AI</span> Vad betyder det här?
          </h3>
          {forklaring ? (
            forklaring.split(/\n+/).map((s, i) => <p key={i}>{s}</p>)
          ) : forklaringFel ? (
            <p className="liten">Förklaringen kunde inte hämtas ({forklaringFel}). Planen gäller ändå.</p>
          ) : (
            <p className="laddar-text">Skriver förklaring…</p>
          )}
          {forklaring && (
            <div className="forklaring-fot">
              <button className="lank liten" onClick={() => setOmgang((n) => n + 1)}>
                Skriv om förklaringen
              </button>
            </div>
          )}
          {plan.kvaveOverskottKgPerAr > 1 && (
            <div className="miljo">
              <strong>{tal(plan.kvaveOverskottKgPerAr, 0)} kg kväve per år</strong> hamnar i gödseln från protein hästen
              inte behöver. Ett grovfoder med lägre proteinhalt minskar både kostnad och utsläpp.
            </div>
          )}
        </section>
      </div>

      <section className="kort">
        <div className="kort-rubrikrad">
          <h3>Inköpslista</h3>
          <button className="knapp sekundar kompakt" onClick={onSparaIJournal}>
            Spara planen i journalen
          </button>
        </div>
        {inkop.length > 0 ? (
          <table className="tabell lista">
            <thead>
              <tr>
                <th>Produkt</th>
                <th className="dolj-smal">Butik och pris</th>
                <th className="hoger">Per dag</th>
                <th className="hoger">Per månad</th>
              </tr>
            </thead>
            <tbody>
              {inkop.map((p) => (
                <tr key={p.produkt.id}>
                  <td>
                    <strong>{visningsnamn(p.produkt)}</strong>
                    {ersatter(p.produkt.id) && (
                      <span className="liten ersatter">Ersätter {ersatter(p.produkt.id)}</span>
                    )}
                    {p.produkt.dosKalla && (
                      <span className="liten" title={p.produkt.antaganden.join(' ')}>
                        Tillverkarens dos: {p.produkt.dosKalla}
                      </span>
                    )}
                  </td>
                  <td className="liten-cell dolj-smal">
                    {p.produkt.url ? (
                      <a href={p.produkt.url} target="_blank" rel="noreferrer">
                        {p.produkt.butik}
                      </a>
                    ) : (
                      p.produkt.butik
                    )}{' '}
                    · {kr(p.produkt.prisKr)} för {tal(p.produkt.forpackningKg)} kg
                  </td>
                  <td className="hoger">{p.gramPerDag} g</td>
                  <td className="hoger">{kr(kostnadPerManad(p.produkt, p.gramPerDag))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="dolj-smal">
                  Totalt utöver grovfodret
                </td>
                <td className="visa-smal">Totalt</td>
                <td />
                <td className="hoger">
                  <strong>{kr(totalNy)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p>Inga tillskott behövs utöver grovfodret.</p>
        )}
        {plan.alternativ && (
          <p className="alternativ">
            Alternativ: {plan.alternativ.poster.map((p) => `${visningsnamn(p.produkt)} ${p.gramPerDag} g`).join(' + ')},
            cirka {kr(plan.alternativ.kostnadPerManad + behallnaKostnad)}/mån.
          </p>
        )}
      </section>

      <div className="plan-detaljer">
        <section className="kort">
          <h3>Underlaget för planen</h3>
          <p>
            Behov {tal(plan.behov.behov.energi!.min, 0)} MJ och {tal(plan.behov.behov.smbRp!.min, 0)} g smältbart
            protein per dag, räknat på {tal(plan.behov.berakningsviktKg, 0)} kg
            {plan.behov.arbetsMJ > 0 && <>, varav {tal(plan.behov.arbetsMJ, 1)} MJ för arbete</>}
            {plan.behov.kylaMJ > 0 && <> och {tal(plan.behov.kylaMJ, 1)} MJ för kyla</>}.
          </p>
          {(nulageBrister.length > 0 || nulageEnergi.status === 'overskott') && (
            <p className="nulage">
              Med dagens foder:{' '}
              {[
                nulageEnergi.status === 'overskott' && `${energiProcent} % mer energi än behovet`,
                nulageBrister.length > 0 && `för lite ${nulageBrister.join(', ')}`,
              ]
                .filter(Boolean)
                .join(', och ')}
              .
            </p>
          )}
        </section>

        {(plan.kansligheter.length > 0 || plan.bortvalda.length > 0) && (
          <section className="kort">
            <h3>Anpassat efter {hast.namn}s hälsa</h3>
            <div className="kvalitet">
              {plan.kansligheter.map((k) => (
                <div key={k.text} className={`kvalitet-rad ${k.niva}`}>
                  <span>{k.text}</span>
                  <span className="liten">{k.kalla}</span>
                </div>
              ))}
            </div>
            {plan.bortvalda.length > 0 && (
              <details className="bortvalda">
                <summary>{plan.bortvalda.length} produkter valdes bort</summary>
                <ul>
                  {plan.bortvalda.map((b) => (
                    <li key={b.namn}>
                      {b.namn}: {b.skal.join(', ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {plan.grovfoderkvalitet.length > 0 && (
          <section className="kort">
            <h3>Om ditt grovfoder</h3>
            <div className="kvalitet">
              {plan.grovfoderkvalitet.map((f) => (
                <div key={f.rubrik} className={`kvalitet-rad ${f.niva}`}>
                  <strong>{f.rubrik}</strong>
                  <span>{f.text}</span>
                  <span className="liten">{f.kalla}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="kort">
        <h3>Behov och tillförsel per dag</h3>
        <p className="liten">
          Behov enligt SLU. Tillförsel från grovfodret och förslaget. Ca/P-kvot {tal(plan.caP ?? undefined, 2)} (SLU:
          minst 1,1, helst 1,2–1,8).
        </p>
        <Balanstabell rader={plan.resultat} />
        {plan.resultat.some((r) => r.status === 'okand' || r.status === 'osaker') && (
          <p className="liten">
            Okänt betyder att grovfodrets halt inte analyserats. Osäkert betyder att ett uppskattat värde ligger under
            behovet. Enligt SLU ger vallfoder av god kvalitet normalt tillräckligt av de flesta mikromineraler, och
            hästar som vistas ute dagligen behöver normalt inga extra vitaminer vid lätt till medelhårt arbete.
            Analysera grovfodret om du vill veta säkert.
          </p>
        )}
        {plan.noteringar.length > 0 && (
          <ul className="noteringar">
            {plan.noteringar.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Balanstabell({ rader }: { rader: Balansrad[] }) {
  const visade = rader.filter((r) => r.status !== 'ej_krav' && r.behovMin !== undefined)
  return (
    <table className="tabell">
      <thead>
        <tr>
          <th>Ämne</th>
          <th className="hoger">Behov</th>
          <th className="hoger">Får</th>
          <th className="hoger">Max</th>
          <th>Status</th>
          <th>Källa</th>
        </tr>
      </thead>
      <tbody>
        {visade.map((r) => {
          const [text, klass] = STATUS[r.status]
          return (
            <tr key={r.amne}>
              <td>{etikett(r.amne)}</td>
              <td className="hoger">
                {tal(r.behovMin)} {enhet(r.amne)}
              </td>
              <td className="hoger">{r.status === 'okand' ? '–' : `${tal(r.intag)} ${enhet(r.amne)}`}</td>
              <td className="hoger liten">{r.behovMax !== undefined ? tal(r.behovMax) : ''}</td>
              <td>
                <span className={`chip ${klass}`}>{text}</span>
              </td>
              <td className="kalla">
                {r.kalla === 'schablon'
                  ? 'Grovfoder: uppskattat'
                  : r.kalla === 'okand'
                    ? 'Grovfoder: ej analyserat'
                    : 'Grovfoder: analys'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Kompakt underlag till AI-förklaringen. Bara färdiga siffror, inga rådata. */
function underlag(hast: Hastprofil, analys: Grovfoderanalys, plan: Plan) {
  const rad = (r: Balansrad) => ({
    amne: etikett(r.amne),
    behov: r.behovMin && +r.behovMin.toFixed(2),
    tillfort: +r.intag.toFixed(2),
    enhet: enhet(r.amne),
    status: r.status,
    uppskattat: r.kalla === 'schablon',
  })
  return {
    hast: {
      namn: hast.namn,
      alder: hast.alderAr,
      viktKg: hast.viktKg,
      hull: hast.hull,
      halsa: hast.halsa,
      ovrigt: hast.halsa.ovrigt,
    },
    grovfoder: { typ: analys.typ, kgPerDag: +plan.grovfoderKgPerDag.toFixed(1) },
    nulageMedDagensFoder: plan.nulage.filter((r) => r.status === 'brist' || r.status === 'overskott').map(rad),
    atgarder: plan.atgarder.map((a) => a.text),
    efterForslaget: plan.resultat.filter((r) => r.status !== 'ej_krav').map(rad),
    kostnadMedForslagetKrPerManad: Math.round(
      (plan.urval?.kostnadPerManad ?? 0) +
        plan.behallnaFoder.reduce((s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag), 0),
    ),
    kostnadIdagKrPerManad: Math.round(plan.nulageKostnadPerManad),
    alternativ: plan.alternativ && {
      produkter: plan.alternativ.poster.map((p) => `${visningsnamn(p.produkt)} ${p.gramPerDag} g/dag`),
      kostnadKrPerManad: Math.round(
        plan.alternativ.kostnadPerManad +
          plan.behallnaFoder.reduce((s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag), 0),
      ),
    },
    byten: plan.byten.map((b) => ({
      fran: `${visningsnamn(b.fran.produkt)} ${b.fran.gramPerDag} g/dag`,
      till: `${visningsnamn(b.till.produkt)} ${b.till.gramPerDag} g/dag`,
      varfor: b.skal,
      kostnadForeKrPerManad: Math.round(b.kostnadFore),
      kostnadEfterKrPerManad: Math.round(b.kostnadEfter),
    })),
    kvaveOverskottKgPerAr: Math.round(plan.kvaveOverskottKgPerAr),
    omGrovfodret: plan.grovfoderkvalitet.map((f) => `${f.rubrik}: ${f.text}`),
    kansligheter: plan.kansligheter.map((k) => k.text),
    bortvaldaProdukter: plan.bortvalda.map((b) => `${b.namn} (${b.skal.join(', ')})`),
    varningar: plan.varningar,
    foderbyte: { dagar: plan.injustering.dagar, steg: plan.injustering.steg.length },
    saknasIAnalysen: plan.saknadeAnalysvarden.map(etikett),
  }
}
