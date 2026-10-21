import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { forklaraPlan } from '../api'
import { monthlyCost, displayName } from '@fodr/domain/intake'
import type { Balansrad, Plan, Status } from '@fodr/domain/plan'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { enhet, etikett, kr, tal } from '../format'
import { domainText } from '../i18n/domain'
import { avtryck, laddaForklaring, sparaForklaring } from '../storage'
import { Injusteringskalender } from './Injusteringskalender'

const STATUS_KLASS: Record<Status, string> = {
  brist: 'brist',
  ok: 'ok',
  overskott: 'varn',
  over_max: 'brist',
  okand: 'okand',
  osaker: 'okand',
  ej_krav: 'okand',
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
  const { t } = useTranslation()
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
  const behallnaKostnad = plan.behallnaFoder.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0)
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
    const namn = plan.byten.filter((x) => x.till.produkt.id === id).map((x) => displayName(x.fran.produkt))
    return namn.length ? namn.join(t('plan.shopping.and')) : undefined
  }
  const inkop = [...plan.behallnaFoder, ...(u?.poster ?? [])]

  return (
    <div className="plan">
      <header className="plan-topp">
        <h2>{t('plan.title', { name: hast.namn })}</h2>
        <div className="kostnadsrad" aria-label={t('plan.costLabel')}>
          <span className="kostnadsrad-belopp">{t('units.perMonth', { amount: kr(totalNy) })}</span>
          {plan.nulageKostnadPerManad > 0 && (
            <span className={`kostnadsrad-jmf ${besparing >= 0 ? 'ok' : ''}`}>
              {besparing >= 0
                ? t('plan.cheaperThanToday', { amount: kr(besparing) })
                : t('plan.dearerThanToday', { amount: kr(-besparing) })}
            </span>
          )}
        </div>
      </header>

      <div className="plan-huvud">
        <section className="kort">
          <h3>{t('plan.doThis')}</h3>
          <ol className="atgarder">
            <li>
              {t('plan.giveRoughage', {
                kg: tal(plan.grovfoderKgPerDag, 1),
                type: t(analys.typ === 'hosilage' ? 'roughage.hosilage' : 'roughage.ho'),
              })}
            </li>
            {plan.atgarder.map((a) => {
              const text = domainText(a)
              return (
                <li key={text} className={a.typ}>
                  {text}
                </li>
              )
            })}
          </ol>
          {plan.varningar.length > 0 && (
            <div className="ruta varn">
              {plan.varningar.map(domainText).map((v) => (
                <p key={v}>{v}</p>
              ))}
            </div>
          )}
          <Injusteringskalender injustering={plan.injustering} hastNamn={hast.namn} />
        </section>

        <section className="kort forklaring">
          <h3>
            <span className="ai-bricka">{t('common.aiBadge')}</span> {t('plan.explanation.title')}
          </h3>
          {forklaring ? (
            forklaring.split(/\n+/).map((s, i) => <p key={i}>{s}</p>)
          ) : forklaringFel ? (
            <p className="liten">{t('plan.explanation.failed', { error: forklaringFel })}</p>
          ) : (
            <p className="laddar-text">{t('plan.explanation.writing')}</p>
          )}
          {forklaring && (
            <div className="forklaring-fot">
              <button className="lank liten" onClick={() => setOmgang((n) => n + 1)}>
                {t('plan.explanation.rewrite')}
              </button>
            </div>
          )}
          {plan.kvaveOverskottKgPerAr > 1 && (
            <div className="miljo">
              <Trans
                i18nKey="plan.nitrogen"
                values={{ kg: tal(plan.kvaveOverskottKgPerAr, 0) }}
                components={{ strong: <strong /> }}
              />
            </div>
          )}
        </section>
      </div>

      <section className="kort">
        <div className="kort-rubrikrad">
          <h3>{t('plan.shopping.title')}</h3>
          <button className="knapp sekundar kompakt" onClick={onSparaIJournal}>
            {t('plan.shopping.saveToJournal')}
          </button>
        </div>
        {inkop.length > 0 ? (
          <table className="tabell lista">
            <thead>
              <tr>
                <th>{t('plan.shopping.product')}</th>
                <th className="dolj-smal">{t('plan.shopping.storeAndPrice')}</th>
                <th className="hoger">{t('plan.shopping.perDay')}</th>
                <th className="hoger">{t('plan.shopping.perMonth')}</th>
              </tr>
            </thead>
            <tbody>
              {inkop.map((p) => (
                <tr key={p.produkt.id}>
                  <td>
                    <strong>{displayName(p.produkt)}</strong>
                    {ersatter(p.produkt.id) && (
                      <span className="liten ersatter">
                        {t('plan.shopping.replaces', { products: ersatter(p.produkt.id) })}
                      </span>
                    )}
                    {p.produkt.dosKalla && (
                      <span className="liten" title={p.produkt.antaganden.join(' ')}>
                        {t('plan.shopping.manufacturerDose', { dose: p.produkt.dosKalla })}
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
                    {t('plan.shopping.price', { price: kr(p.produkt.prisKr), kg: tal(p.produkt.forpackningKg) })}
                  </td>
                  <td className="hoger">{t('units.g', { value: tal(p.gramPerDag, 0) })}</td>
                  <td className="hoger">{kr(monthlyCost(p.produkt, p.gramPerDag))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="dolj-smal">
                  {t('plan.shopping.totalBeyondRoughage')}
                </td>
                <td className="visa-smal">{t('plan.shopping.total')}</td>
                <td />
                <td className="hoger">
                  <strong>{kr(totalNy)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p>{t('plan.shopping.none')}</p>
        )}
        {plan.alternativ && (
          <p className="alternativ">
            {t('plan.shopping.alternative', {
              products: plan.alternativ.poster
                .map((p) =>
                  t('plan.shopping.productGrams', { name: displayName(p.produkt), grams: tal(p.gramPerDag, 0) }),
                )
                .join(' + '),
              amount: t('units.perMonth', { amount: kr(plan.alternativ.kostnadPerManad + behallnaKostnad) }),
            })}
          </p>
        )}
      </section>

      <div className="plan-detaljer">
        <section className="kort">
          <h3>{t('plan.basis.title')}</h3>
          <p>
            {t('plan.basis.requirement', {
              mj: tal(plan.behov.behov.energi!.min, 0),
              g: tal(plan.behov.behov.smbRp!.min, 0),
              kg: tal(plan.behov.berakningsviktKg, 1),
            })}
            {plan.behov.arbetsMJ > 0 && t('plan.basis.work', { mj: tal(plan.behov.arbetsMJ, 1) })}
            {plan.behov.kylaMJ > 0 && t('plan.basis.cold', { mj: tal(plan.behov.kylaMJ, 1) })}.
          </p>
          {(nulageBrister.length > 0 || nulageEnergi.status === 'overskott') && (
            <p className="nulage">
              {t('plan.basis.today')}{' '}
              {[
                nulageEnergi.status === 'overskott' && t('plan.basis.moreEnergy', { percent: tal(energiProcent, 0) }),
                nulageBrister.length > 0 && t('plan.basis.tooLittle', { nutrients: nulageBrister.join(', ') }),
              ]
                .filter(Boolean)
                .join(t('plan.basis.todayAnd'))}
              .
            </p>
          )}
        </section>

        {(plan.kansligheter.length > 0 || plan.bortvalda.length > 0) && (
          <section className="kort">
            <h3>{t('plan.health.title', { name: hast.namn })}</h3>
            <div className="kvalitet">
              {plan.kansligheter.map((k) => {
                const text = domainText(k.text)
                return (
                  <div key={text} className={`kvalitet-rad ${k.niva}`}>
                    <span>{text}</span>
                    <span className="liten">{domainText(k.kalla)}</span>
                  </div>
                )
              })}
            </div>
            {plan.bortvalda.length > 0 && (
              <details className="bortvalda">
                <summary>{t('plan.health.excluded', { n: tal(plan.bortvalda.length, 0) })}</summary>
                <ul>
                  {plan.bortvalda.map((b) => (
                    <li key={b.namn}>
                      {b.namn}: {b.skal.map(domainText).join(', ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {plan.grovfoderkvalitet.length > 0 && (
          <section className="kort">
            <h3>{t('plan.roughageQuality')}</h3>
            <div className="kvalitet">
              {plan.grovfoderkvalitet.map((f) => (
                <div key={f.rubrik.code} className={`kvalitet-rad ${f.niva}`}>
                  <strong>{domainText(f.rubrik)}</strong>
                  <span>{domainText(f.text)}</span>
                  <span className="liten">{domainText(f.kalla)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="kort">
        <h3>{t('plan.balance.title')}</h3>
        <p className="liten">{t('plan.balance.intro', { ratio: tal(plan.caP ?? undefined, 2) })}</p>
        <Balanstabell rader={plan.resultat} />
        {plan.resultat.some((r) => r.status === 'okand' || r.status === 'osaker') && (
          <p className="liten">{t('plan.balance.unknownNote')}</p>
        )}
        {plan.noteringar.length > 0 && (
          <ul className="noteringar">
            {plan.noteringar.map(domainText).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Balanstabell({ rader }: { rader: Balansrad[] }) {
  const { t } = useTranslation()
  const visade = rader.filter((r) => r.status !== 'ej_krav' && r.behovMin !== undefined)
  return (
    <table className="tabell">
      <thead>
        <tr>
          <th>{t('plan.balance.nutrient')}</th>
          <th className="hoger">{t('plan.balance.requirementColumn')}</th>
          <th className="hoger">{t('plan.balance.intake')}</th>
          <th className="hoger">{t('plan.balance.max')}</th>
          <th>{t('plan.balance.statusColumn')}</th>
          <th>{t('plan.balance.source')}</th>
        </tr>
      </thead>
      <tbody>
        {visade.map((r) => {
          return (
            <tr key={r.amne}>
              <td>{etikett(r.amne)}</td>
              <td className="hoger">
                {tal(r.behovMin)} {enhet(r.amne)}
              </td>
              <td className="hoger">{r.status === 'okand' ? '–' : `${tal(r.intag)} ${enhet(r.amne)}`}</td>
              <td className="hoger liten">{r.behovMax !== undefined ? tal(r.behovMax) : ''}</td>
              <td>
                <span className={`chip ${STATUS_KLASS[r.status]}`}>{t(`plan.status.${r.status}`)}</span>
              </td>
              <td className="kalla">
                {r.kalla === 'schablon'
                  ? t('plan.balance.sourceEstimated')
                  : r.kalla === 'okand'
                    ? t('plan.balance.sourceNotAnalysed')
                    : t('plan.balance.sourceAnalysis')}
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
    atgarder: plan.atgarder.map(domainText),
    efterForslaget: plan.resultat.filter((r) => r.status !== 'ej_krav').map(rad),
    kostnadMedForslagetKrPerManad: Math.round(
      (plan.urval?.kostnadPerManad ?? 0) +
        plan.behallnaFoder.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0),
    ),
    kostnadIdagKrPerManad: Math.round(plan.nulageKostnadPerManad),
    alternativ: plan.alternativ && {
      produkter: plan.alternativ.poster.map((p) => `${displayName(p.produkt)} ${p.gramPerDag} g/dag`),
      kostnadKrPerManad: Math.round(
        plan.alternativ.kostnadPerManad +
          plan.behallnaFoder.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0),
      ),
    },
    byten: plan.byten.map((b) => ({
      fran: `${displayName(b.fran.produkt)} ${b.fran.gramPerDag} g/dag`,
      till: `${displayName(b.till.produkt)} ${b.till.gramPerDag} g/dag`,
      varfor: domainText(b.skal),
      kostnadForeKrPerManad: Math.round(b.kostnadFore),
      kostnadEfterKrPerManad: Math.round(b.kostnadEfter),
    })),
    kvaveOverskottKgPerAr: Math.round(plan.kvaveOverskottKgPerAr),
    omGrovfodret: plan.grovfoderkvalitet.map((f) => `${domainText(f.rubrik)}: ${domainText(f.text)}`),
    kansligheter: plan.kansligheter.map((k) => domainText(k.text)),
    bortvaldaProdukter: plan.bortvalda.map((b) => `${b.namn} (${b.skal.map(domainText).join(', ')})`),
    varningar: plan.varningar.map(domainText),
    foderbyte: { dagar: plan.injustering.dagar, steg: plan.injustering.steg.length },
    saknasIAnalysen: plan.saknadeAnalysvarden.map(etikett),
  }
}
