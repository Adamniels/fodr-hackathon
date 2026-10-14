import { useEffect, useMemo, useState } from 'react'
import { forklaraPlan } from '../api'
import { byggBoxkort } from '../domain/boxkort'
import { kostnadPerManad } from '../domain/intake'
import type { NutrientKey } from '../domain/nutrients'
import type { Balansrad, Plan, Status } from '../domain/plan'
import type { Grovfoderanalys, Hastprofil } from '../domain/types'
import { enhet, etikett, kr, tal } from '../format'
import { Boxkort } from './Boxkort'

const STATUS: Record<Status, [string, string]> = {
  brist: ['Brist', 'brist'],
  ok: ['Täckt', 'ok'],
  overskott: ['Överskott', 'varn'],
  over_max: ['Över maxgräns', 'brist'],
  okand: ['Okänt', 'okand'],
  osaker: ['Osäkert', 'okand'],
  ej_krav: ['', 'okand'],
}

// Ämnen som visas som staplar. Övriga finns i tabellen under "Alla näringsämnen".
const STAPLAR: NutrientKey[] = ['energi', 'smbRp', 'ca', 'p', 'mg', 'na', 'se', 'vitE', 'cu', 'zn']
const datumText = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })

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
  const [forklaring, setForklaring] = useState<string | null>(null)
  const [forklaringFel, setForklaringFel] = useState<string | null>(null)
  const kort = useMemo(() => byggBoxkort(plan, analys.typ), [plan, analys.typ])

  useEffect(() => {
    let avbruten = false
    setForklaring(null)
    setForklaringFel(null)
    forklaraPlan(underlag(hast, analys, plan))
      .then((r) => !avbruten && setForklaring(r.text))
      .catch((e) => !avbruten && setForklaringFel(e instanceof Error ? e.message : String(e)))
    return () => {
      avbruten = true
    }
  }, [hast, analys, plan])

  const poster = [...plan.behallnaFoder, ...(plan.urval?.poster ?? [])]
  const kostnad = poster.reduce((s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag), 0)

  return (
    <div className="plan-layout">
      <div className="plan-kort">
        <Boxkort
          namn={hast.namn}
          datum={datumText(new Date().toISOString().slice(0, 10))}
          kort={kort}
          kostnadPerManad={kostnad}
          kostnadIdag={plan.nulageKostnadPerManad}
        >
          <div className="boxkort-knappar">
            <button className="knapp" onClick={onSparaIJournal}>
              Spara i journalen
            </button>
            <button className="knapp sekundar" onClick={() => window.print()}>
              Skriv ut boxkortet
            </button>
          </div>
        </Boxkort>

        <section className="inkop" aria-labelledby="inkop-rubrik">
          <h2 id="inkop-rubrik">Att köpa</h2>
          <ul>
            {poster.map((p) => (
              <li key={p.produkt.id}>
                <span className="inkop-namn">{p.produkt.namn}</span>
                <span className="inkop-detalj">
                  {kr(p.produkt.prisKr)} för {tal(p.produkt.forpackningKg)}&nbsp;kg hos{' '}
                  {p.produkt.url ? (
                    <a href={p.produkt.url} target="_blank" rel="noreferrer">
                      {p.produkt.butik}
                    </a>
                  ) : (
                    p.produkt.butik
                  )}
                  , räcker {Math.round((p.produkt.forpackningKg * 1000) / p.gramPerDag)} dagar
                </span>
                {p.produkt.dosKalla && <span className="inkop-kalla">Tillverkarens dos: {p.produkt.dosKalla}</span>}
                {p.produkt.antaganden.length > 0 && (
                  <span className="inkop-kalla">Antagande: {p.produkt.antaganden.join(' ')}</span>
                )}
              </li>
            ))}
          </ul>
          {plan.alternativ && (
            <p className="alternativ">
              Alternativ: {plan.alternativ.poster.map((p) => `${p.produkt.namn}, ${p.gramPerDag}\u00a0g`).join(' och ')}, cirka{' '}
              {kr(plan.alternativ.kostnadPerManad + plan.behallnaFoder.reduce((s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag), 0))} per månad.
            </p>
          )}
        </section>
      </div>

      <div className="plan-varfor">
        {plan.varningar.length > 0 && (
          <div className="obs" role="note">
            <span className="obs-etikett">Viktigt</span>
            <div>
              {plan.varningar.map((v) => (
                <p key={v}>{v}</p>
              ))}
            </div>
          </div>
        )}

        <section className="del-plan" aria-labelledby="varfor-rubrik">
          <h2 id="varfor-rubrik">Därför</h2>
          <p className="nulage-text">{nulageText(hast.namn, plan)}</p>
          <ul className="atgarder">
            {plan.atgarder.map((a) => (
              <li key={a.text} className={a.typ}>
                {a.text}
              </li>
            ))}
          </ul>
        </section>

        <section className="del-plan" aria-labelledby="balans-rubrik">
          <h2 id="balans-rubrik">Behov och tillförsel med planen</h2>
          <p className="del-ingress">Andel av SLU:s rekommenderade dagsbehov. Strecket är 100 %.</p>
          <Balansstaplar rader={plan.resultat} />
          <details className="alla-siffror">
            <summary>Alla näringsämnen och källor</summary>
            <Balanstabell rader={plan.resultat} />
            <p className="liten">
              Okänt betyder att grovfodrets halt inte analyserats. Osäkert betyder att ett uppskattat värde ligger under
              behovet. Enligt SLU ger vallfoder av god kvalitet normalt tillräckligt av de flesta mikromineraler. Ca/P-kvot{' '}
              {tal(plan.caP ?? undefined, 2)}, SLU rekommenderar minst 1,1.
            </p>
          </details>
        </section>

        {(plan.kansligheter.length > 0 || plan.bortvalda.length > 0) && (
          <section className="del-plan" aria-labelledby="halsa-rubrik">
            <h2 id="halsa-rubrik">Anpassat efter {hast.namn}s hälsa</h2>
            <ul className="noter">
              {plan.kansligheter.map((k) => (
                <li key={k.text} className={k.niva}>
                  {k.text} <span className="kalla-text">{k.kalla}</span>
                </li>
              ))}
            </ul>
            {plan.bortvalda.length > 0 && (
              <details className="alla-siffror">
                <summary>{plan.bortvalda.length} produkter valdes bort</summary>
                <ul className="noter">
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
          <section className="del-plan" aria-labelledby="grov-rubrik">
            <h2 id="grov-rubrik">Om grovfodret</h2>
            <ul className="noter">
              {plan.grovfoderkvalitet.map((f) => (
                <li key={f.rubrik} className={f.niva}>
                  <strong>{f.rubrik}.</strong> {f.text} <span className="kalla-text">{f.kalla}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="del-plan forklaring" aria-labelledby="ai-rubrik" aria-live="polite">
          <h2 id="ai-rubrik">
            Förklarat <span className="ai-markor">AI</span>
          </h2>
          {forklaring ? (
            forklaring.split(/\n+/).map((s, i) => <p key={i}>{s}</p>)
          ) : forklaringFel ? (
            <p className="liten">Förklaringen kunde inte hämtas: {forklaringFel} Planen ovan gäller ändå.</p>
          ) : (
            <p className="laddar-text">Skriver förklaringen…</p>
          )}
        </section>

        {plan.kvaveOverskottKgPerAr > 1 && (
          <p className="miljo">
            Proteinöverskottet motsvarar ungefär {tal(plan.kvaveOverskottKgPerAr, 0)}&nbsp;kg kväve per år i gödseln. Ett
            grovfoder med lägre proteinhalt sänker både kostnaden och utsläppen.
          </p>
        )}
      </div>
    </div>
  )
}

function nulageText(namn: string, plan: Plan): string {
  const energi = plan.nulage.find((r) => r.amne === 'energi')!
  const delar: string[] = []
  if (energi.status === 'overskott') {
    delar.push(`${Math.round((energi.intag / energi.behovMin! - 1) * 100)} % mer energi än behovet`)
  } else if (energi.status === 'brist') {
    delar.push(`${Math.round((1 - energi.intag / energi.behovMin!) * 100)} % för lite energi`)
  }
  const brister = plan.nulage
    .filter((r) => r.status === 'brist' && r.amne !== 'energi')
    .map((r) => etikett(r.amne).replace(/\s*\(.*\)$/, '').replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase()))
  if (brister.length) delar.push(`för lite ${brister.join(', ')}`)
  const behov = `Behovet är ${tal(plan.behov.behov.energi!.min, 0)} MJ och ${tal(plan.behov.behov.smbRp!.min, 0)} g smältbart protein per dag, räknat på ${tal(plan.behov.berakningsviktKg, 0)} kg.`
  return delar.length ? `Med dagens foder får ${namn} ${delar.join(' och ')}. ${behov}` : `Dagens foder täcker behoven. ${behov}`
}

function Balansstaplar({ rader }: { rader: Balansrad[] }) {
  const visade = rader.filter(
    (r) => STAPLAR.includes(r.amne) && r.behovMin && r.status !== 'okand' && r.status !== 'ej_krav',
  )
  return (
    <ul className="staplar">
      {visade.map((r) => {
        const andel = r.intag / r.behovMin!
        const bredd = (Math.min(andel, 2) / 2) * 100
        const maxAndel = r.behovMax ? r.behovMax / r.behovMin! : undefined
        const klass =
          r.status === 'brist' || r.status === 'over_max'
            ? 'brist'
            : r.status === 'osaker'
              ? 'osaker'
              : r.status === 'overskott' || (r.amne === 'smbRp' && andel > 1.3)
                ? 'varn'
                : 'ok'
        return (
          <li key={r.amne} className={`stapel ${klass}`}>
            <span className="stapel-namn">{etikett(r.amne)}</span>
            <span className="stapel-spar" role="img" aria-label={`${Math.round(andel * 100)} procent av behovet`}>
              <span className="stapel-fyll" style={{ width: `${bredd}%` }} />
              <span className="stapel-behov" />
              {maxAndel !== undefined && maxAndel <= 2 && (
                <span className="stapel-max" style={{ left: `${(maxAndel / 2) * 100}%` }} />
              )}
            </span>
            <span className="stapel-varde">
              {andel >= 2 ? '>200' : Math.round(andel * 100)}&nbsp;%
            </span>
          </li>
        )
      })}
    </ul>
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
    kostnadKrPerManad: Math.round(plan.urval?.kostnadPerManad ?? 0),
    kostnadIdagKrPerManad: Math.round(plan.nulageKostnadPerManad),
    alternativ: plan.alternativ && {
      produkter: plan.alternativ.poster.map((p) => `${p.produkt.namn} ${p.gramPerDag} g/dag`),
      kostnadKrPerManad: Math.round(plan.alternativ.kostnadPerManad),
    },
    kvaveOverskottKgPerAr: Math.round(plan.kvaveOverskottKgPerAr),
    omGrovfodret: plan.grovfoderkvalitet.map((f) => `${f.rubrik}: ${f.text}`),
    kansligheter: plan.kansligheter.map((k) => k.text),
    bortvaldaProdukter: plan.bortvalda.map((b) => `${b.namn} (${b.skal.join(', ')})`),
    varningar: plan.varningar,
    saknasIAnalysen: plan.saknadeAnalysvarden.map(etikett),
  }
}
