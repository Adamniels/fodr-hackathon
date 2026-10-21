import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { explainPlan } from '../api'
import { monthlyCost, displayName } from '@fodr/domain/intake'
import type { Balansrad, Plan, Status } from '@fodr/domain/plan'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { doseGrams, nutrientUnit, nutrientLabel, formatMoney, formatNumber, shortNutrientLabel } from '../format'
import i18n from '../i18n'
import { domainText } from '../i18n/domain'
import { fingerprint, loadExplanation, saveExplanation } from '../storage'
import { TransitionCalendar } from './TransitionCalendar'

const STATUS_CLASS: Record<Status, string> = {
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
  onSaveToJournal,
}: {
  hast: Hastprofil
  analys: Grovfoderanalys
  plan: Plan
  onSaveToJournal: () => void
}) {
  const { t } = useTranslation()
  // The explanation is cached per horse and payload. The same plan shows the cached text instead of
  // asking Claude again; only a changed plan (or the "Skriv om" button) makes a new call.
  const payload = useMemo(() => explanationPayload(hast, analys, plan), [hast, analys, plan])
  const payloadFingerprint = useMemo(() => fingerprint(JSON.stringify(payload)), [payload])
  const [explanation, setExplanation] = useState<string | null>(() => loadExplanation(hast.id, payloadFingerprint))
  const [forklaringFel, setForklaringFel] = useState<string | null>(null)
  const [omgang, setOmgang] = useState(0)

  useEffect(() => {
    const cached = omgang === 0 ? loadExplanation(hast.id, payloadFingerprint) : null
    setForklaringFel(null)
    if (cached) {
      setExplanation(cached)
      return
    }
    let avbruten = false
    setExplanation(null)
    explainPlan(payload)
      .then((r) => {
        saveExplanation(hast.id, payloadFingerprint, r.text)
        if (!avbruten) setExplanation(r.text)
      })
      .catch((e: unknown) => !avbruten && setForklaringFel(e instanceof Error ? e.message : String(e)))
    return () => {
      avbruten = true
    }
  }, [hast.id, payloadFingerprint, payload, omgang])

  const u = plan.urval
  const nyKostnad = u?.kostnadPerManad ?? 0
  const behallnaKostnad = plan.behallnaFoder.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0)
  const totalNy = nyKostnad + behallnaKostnad
  const besparing = plan.nulageKostnadPerManad - totalNy
  const nulageBrister = plan.nulage.filter((r) => r.status === 'brist').map((r) => shortNutrientLabel(r.amne))
  // The current state lists every nutrient, energy included, against its requirement.
  const nulageEnergi = plan.nulage.find((r) => r.amne === 'energi')
  const energiProcent = (intag: number) => Math.round((intag / plan.behov.behov.energi.min - 1) * 100)
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
          <span className="kostnadsrad-belopp">{t('units.perMonth', { amount: formatMoney(totalNy) })}</span>
          {plan.nulageKostnadPerManad > 0 && (
            <span className={`kostnadsrad-jmf ${besparing >= 0 ? 'ok' : ''}`}>
              {besparing >= 0
                ? t('plan.cheaperThanToday', { amount: formatMoney(besparing) })
                : t('plan.dearerThanToday', { amount: formatMoney(-besparing) })}
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
                kg: formatNumber(plan.grovfoderKgPerDag, 1),
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
          {/* Keyed on the horse: its start date and selected step belong to this horse's plan (#109). */}
          <TransitionCalendar key={hast.id} injustering={plan.injustering} hastNamn={hast.namn} />
        </section>

        <section className="kort forklaring">
          <h3>
            <span className="ai-bricka">{t('common.aiBadge')}</span> {t('plan.explanation.title')}
          </h3>
          {explanation ? (
            explanation.split(/\n+/).map((s, i) => <p key={i}>{s}</p>)
          ) : forklaringFel ? (
            <p className="liten">{t('plan.explanation.failed', { error: forklaringFel })}</p>
          ) : (
            <p className="laddar-text">{t('plan.explanation.writing')}</p>
          )}
          {explanation && (
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
                values={{ kg: formatNumber(plan.kvaveOverskottKgPerAr, 0) }}
                components={{ strong: <strong /> }}
              />
            </div>
          )}
        </section>
      </div>

      <section className="kort">
        <div className="kort-rubrikrad">
          <h3>{t('plan.shopping.title')}</h3>
          <button className="knapp sekundar kompakt" onClick={onSaveToJournal}>
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
                    {t('plan.shopping.price', {
                      price: formatMoney(p.produkt.prisKr),
                      kg: formatNumber(p.produkt.forpackningKg),
                    })}
                  </td>
                  <td className="hoger">{t('units.g', { value: doseGrams(p.gramPerDag) })}</td>
                  <td className="hoger">{formatMoney(monthlyCost(p.produkt, p.gramPerDag))}</td>
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
                  <strong>{formatMoney(totalNy)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        ) : plan.urvalshinder ? null : (
          <p>{t('plan.shopping.none')}</p>
        )}
        {plan.urvalshinder && <div className="ruta varn">{domainText(plan.urvalshinder)}</div>}
        {plan.alternativ && (
          <p className="alternativ">
            {t('plan.shopping.alternative', {
              products: plan.alternativ.poster
                .map((p) =>
                  t('plan.shopping.productGrams', {
                    name: displayName(p.produkt),
                    grams: formatNumber(p.gramPerDag, 0),
                  }),
                )
                .join(' + '),
              amount: t('units.perMonth', { amount: formatMoney(plan.alternativ.kostnadPerManad + behallnaKostnad) }),
            })}
          </p>
        )}
      </section>

      <div className="plan-detaljer">
        <section className="kort">
          <h3>{t('plan.basis.title')}</h3>
          <p>
            {t('plan.basis.requirement', {
              mj: formatNumber(plan.behov.behov.energi.min, 0),
              g: formatNumber(plan.behov.behov.smbRp.min, 0),
              kg: formatNumber(plan.behov.berakningsviktKg, 1),
            })}
            {plan.behov.arbetsMJ > 0 && t('plan.basis.work', { mj: formatNumber(plan.behov.arbetsMJ, 1) })}
            {plan.behov.kylaMJ > 0 && t('plan.basis.cold', { mj: formatNumber(plan.behov.kylaMJ, 1) })}.
          </p>
          {(nulageBrister.length > 0 || nulageEnergi?.status === 'overskott') && (
            <p className="nulage">
              {t('plan.basis.today')}{' '}
              {[
                nulageEnergi?.status === 'overskott' &&
                  t('plan.basis.moreEnergy', { percent: formatNumber(energiProcent(nulageEnergi.intag), 0) }),
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
                <summary>{t('plan.health.excluded', { n: formatNumber(plan.bortvalda.length, 0) })}</summary>
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
        <p className="liten">{t('plan.balance.intro', { ratio: formatNumber(plan.caP ?? undefined, 2) })}</p>
        <BalanceTable rader={plan.resultat} />
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

function BalanceTable({ rader }: { rader: Balansrad[] }) {
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
              <td>{nutrientLabel(r.amne)}</td>
              <td className="hoger">
                {formatNumber(r.behovMin)} {nutrientUnit(r.amne)}
              </td>
              <td className="hoger">
                {r.status === 'okand' ? '–' : `${formatNumber(r.intag)} ${nutrientUnit(r.amne)}`}
              </td>
              <td className="hoger liten">{r.behovMax !== undefined ? formatNumber(r.behovMax) : ''}</td>
              <td>
                <span className={`chip ${STATUS_CLASS[r.status]}`}>{t(`plan.status.${r.status}`)}</span>
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

/** Grams per day as on the page, for the explanation request (#103). */
const gPerDay = (g: number) => i18n.t('units.gPerDay', { value: doseGrams(g) })

/** Compact payload for the AI explanation. Only finished figures, no raw data. */
function explanationPayload(hast: Hastprofil, analys: Grovfoderanalys, plan: Plan) {
  const rad = (r: Balansrad) => ({
    amne: nutrientLabel(r.amne),
    behov: r.behovMin && +r.behovMin.toFixed(2),
    tillfort: +r.intag.toFixed(2),
    enhet: nutrientUnit(r.amne),
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
      produkter: plan.alternativ.poster.map((p) => `${displayName(p.produkt)} ${gPerDay(p.gramPerDag)}`),
      kostnadKrPerManad: Math.round(
        plan.alternativ.kostnadPerManad +
          plan.behallnaFoder.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0),
      ),
    },
    byten: plan.byten.map((b) => ({
      fran: `${displayName(b.fran.produkt)} ${gPerDay(b.fran.gramPerDag)}`,
      till: `${displayName(b.till.produkt)} ${gPerDay(b.till.gramPerDag)}`,
      varfor: domainText(b.skal),
      kostnadForeKrPerManad: Math.round(b.kostnadFore),
      kostnadEfterKrPerManad: Math.round(b.kostnadEfter),
    })),
    kvaveOverskottKgPerAr: Math.round(plan.kvaveOverskottKgPerAr),
    omGrovfodret: plan.grovfoderkvalitet.map((f) => `${domainText(f.rubrik)}: ${domainText(f.text)}`),
    kansligheter: plan.kansligheter.map((k) => domainText(k.text)),
    bortvaldaProdukter: plan.bortvalda.map((b) => `${b.namn} (${b.skal.map(domainText).join(', ')})`),
    // Why no supplement could be added goes with the warnings, so the explanation never says none are needed (C3).
    varningar: [...plan.varningar, ...(plan.urvalshinder ? [plan.urvalshinder] : [])].map(domainText),
    foderbyte: { dagar: plan.injustering.dagar, steg: plan.injustering.steg.length },
    saknasIAnalysen: plan.saknadeAnalysvarden.map(nutrientLabel),
  }
}
