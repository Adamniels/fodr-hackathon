// Product administration (#36, CF9): /admin/products, a list of every product, and /admin/products/new and /:productId,
// a form for one. Admins only: anyone else gets the not-found page, as the API answers them 404. Every save is a new
// version on the server and a new product set, so the workspace plans with it at once and saved plans keep theirs.
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { ProductDataSchema, type AdminProduct, type ProductData } from '@fodr/contracts/admin'
import { NUTRIENTS, NUTRIENT_KEYS, type NutrientKey } from '@fodr/domain/nutrients'
import { adminApi, useAdminProduct, useAdminProducts, useAdminWrites } from '../admin'
import { ApiError } from '../api-v1'
import { DecimalInput } from '../components/DecimalInput'
import { formatDate, formatMoney, formatNumber, localIsoDate, nutrientLabel } from '../format'
import { AcceptTerms } from './Legal'
import { PageNotFound } from './RouteError'
import { useSession } from './session'

const CATEGORIES = ProductDataSchema.shape.kategori.options
const DECLARATIONS = ProductDataSchema.shape.naringsdata.options

/** /admin: the admin's pages, or the not-found page for anyone else. */
export function AdminGate() {
  const { user } = useSession()
  const { t } = useTranslation()
  if (user?.role !== 'admin') return <PageNotFound />
  return (
    <AcceptTerms>
      <main className="admin">
        <nav className="admin-nav">
          <Link to="/horses">{t('admin.toHorses')}</Link>
        </nav>
        <Outlet />
      </main>
    </AcceptTerms>
  )
}

export function AdminProductList() {
  const { t } = useTranslation()
  const { user } = useSession()
  const query = useAdminProducts(user?.id ?? '')
  const [search, setSearch] = useState('')
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase()
    return (query.data ?? []).filter((p) =>
      `${p.data.namn} ${p.data.marke} ${p.data.butik}`.toLowerCase().includes(words),
    )
  }, [query.data, search])

  return (
    <>
      <div className="kort-rubrikrad">
        <h1>{t('admin.title')}</h1>
        <Link className="knapp" to="new">
          {t('admin.new')}
        </Link>
      </div>
      <p className="liten">{t('admin.intro')}</p>
      <label className="falt">
        <span className="falt-label">{t('admin.search')}</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {query.isPending ? (
        <p role="status">{t('admin.loading')}</p>
      ) : query.isError ? (
        <p className="ruta fel" role="alert">
          {t('admin.loadFailed')}
        </p>
      ) : (
        <table className="tabell lista">
          <caption className="liten">
            {t('admin.count', { count: shown.length, formatted: formatNumber(shown.length) })}
          </caption>
          <thead>
            <tr>
              <th>{t('admin.columns.name')}</th>
              <th>{t('admin.columns.store')}</th>
              <th>{t('admin.columns.category')}</th>
              <th className="hoger">{t('admin.columns.price')}</th>
              <th>{t('admin.columns.selectable')}</th>
              <th>{t('admin.columns.checked')}</th>
              <th>{t('admin.columns.verified')}</th>
              <th>{t('admin.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={p.id}>{p.data.namn}</Link>
                  {p.editedByAdmin && <span className="liten"> {t('admin.editedByAdmin')}</span>}
                </td>
                <td>{p.data.butik}</td>
                <td>{t(`admin.category.${p.data.kategori}`)}</td>
                <td className="hoger">{formatMoney(p.data.prisKr)}</td>
                <td>{t(p.data.iUrval ? 'admin.yes' : 'admin.no')}</td>
                <td>{t(p.data.deklarationKontrollerad ? 'admin.yes' : 'admin.no')}</td>
                <td>{p.verifiedOn ? formatDate(p.verifiedOn) : ''}</td>
                <td>{t(p.retired ? 'admin.retired' : 'admin.active')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorTrackingCheck />
    </>
  )
}

/** Whether errors reach Sentry where the app runs (#43): one test error from the API and one from the browser. */
function ErrorTrackingCheck() {
  const { t } = useTranslation()
  const [state, setState] = useState<{ sent: string } | 'sending' | 'failed' | null>(null)
  const send = async () => {
    setState('sending')
    try {
      setState({ sent: await adminApi.sendTestError() })
    } catch {
      setState('failed')
    }
  }
  return (
    <section className="kort">
      <h2>{t('admin.errorTracking.title')}</h2>
      <p className="liten">{t('admin.errorTracking.intro')}</p>
      <button className="knapp sekundar" onClick={() => void send()} disabled={state === 'sending'}>
        {t('admin.errorTracking.send')}
      </button>
      {typeof state === 'object' && state !== null && (
        <p role="status">{t('admin.errorTracking.sent', { requestId: state.sent })}</p>
      )}
      {state === 'failed' && (
        <p className="ruta fel" role="alert">
          {t('admin.errorTracking.failed')}
        </p>
      )}
    </section>
  )
}

/**
 * The form's draft: a product's data, with the numbers not given yet. A dose bound not given is unknown, never 0: a
 * dose with one bound only is refused when saved.
 */
type Draft = Omit<ProductData, 'prisKr' | 'forpackningKg' | 'dosGramPer100kg'> & {
  prisKr?: number
  forpackningKg?: number
  dosGramPer100kg?: { min?: number; max?: number }
}

const emptyDraft = (): Draft => ({
  namn: '',
  marke: '',
  kategori: 'tillskott',
  perKg: {},
  iUrval: false,
  deklarationKontrollerad: false,
  lampligVidFangEms: false,
  ingredienser: [],
  naringsdata: 'delvis',
  antaganden: [],
  butik: '',
  kalla: '',
  insamlad: localIsoDate(),
})

export function AdminProductEdit() {
  const { t } = useTranslation()
  const { productId } = useParams()
  const { user } = useSession()
  const query = useAdminProduct(user?.id ?? '', productId)
  // A product just created opens here, saved (its form drops the mark, so a reload does not show it again). Read on
  // every render: the new product's page reuses this component, and its form mounts afresh, keyed on the ID.
  const justCreated = (useLocation().state as { saved?: boolean } | null)?.saved === true
  if (productId === undefined) return <ProductForm key="new" />
  if (query.isPending) return <p role="status">{t('admin.loading')}</p>
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404
    return (
      <>
        <p className="ruta fel" role="alert">
          {t(missing ? 'admin.notFound' : 'admin.productLoadFailed')}
        </p>
        <Link to="/admin/products">{t('admin.back')}</Link>
      </>
    )
  }
  // Keyed on the product: after a save the form keeps what was typed, which is what the server stored.
  return <ProductForm key={query.data.id} product={query.data} saved={justCreated} />
}

function ProductForm({ product, saved = false }: { product?: AdminProduct; saved?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const writes = useAdminWrites()
  const [draft, setDraft] = useState<Draft>(() => product?.data ?? emptyDraft())
  const [verifiedOn, setVerifiedOn] = useState(product?.verifiedOn ?? '')
  const [ingredients, setIngredients] = useState(() => draft.ingredienser.join(', '))
  const [assumptions, setAssumptions] = useState(() => draft.antaganden.join('\n'))
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'invalid'>(saved ? 'saved' : 'idle')
  // An edit after a save makes the form unsaved again.
  // Once shown, the mark that the product was just created is dropped from the history entry.
  useEffect(() => {
    if (saved) void navigate('.', { replace: true, state: null })
  }, [saved, navigate])
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setState((s) => (s === 'saved' ? 'idle' : s))
  }
  const error = (field: string) => errors.get(field)

  const save = async () => {
    const dose = draft.dosGramPer100kg
    const parsed = ProductDataSchema.safeParse({
      ...draft,
      // No bound given is no dose; one bound only is refused below, at the dose fields.
      dosGramPer100kg: dose?.min === undefined && dose?.max === undefined ? undefined : dose,
      ingredienser: ingredients
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      antaganden: assumptions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      url: draft.url?.trim() || undefined,
      form: draft.form?.trim() || undefined,
      dosKalla: draft.dosKalla?.trim() || undefined,
    })
    if (!parsed.success) {
      setErrors(
        new Map(
          parsed.error.issues.map((i) => {
            const [field, message] = fieldError(i.path.map(String), i.code)
            return [field, t(message)]
          }),
        ),
      )
      setState('invalid')
      return
    }
    setErrors(new Map())
    setState('saving')
    try {
      const input = { data: parsed.data, verifiedOn: verifiedOn || null }
      if (product) await writes.update(product.id, input)
      else {
        const created = await writes.create(input)
        void navigate(`/admin/products/${created.id}`, { replace: true, state: { saved: true } })
        return
      }
      setState('saved')
    } catch {
      setState('failed')
    }
  }
  const retire = async (retired: boolean) => {
    if (!product) return
    setState('saving')
    try {
      await writes.setRetired(product.id, retired)
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  const text = (field: 'namn' | 'marke' | 'butik' | 'url' | 'form' | 'dosKalla' | 'kalla', multiline = false) => (
    <label className="falt">
      <span className="falt-label">{t(`admin.fields.${field}`)}</span>
      {multiline ? (
        <textarea rows={2} value={draft[field] ?? ''} onChange={(e) => set({ [field]: e.target.value })} />
      ) : (
        <input value={draft[field] ?? ''} onChange={(e) => set({ [field]: e.target.value })} />
      )}
      {error(field) && <span className="falt-fel">{error(field)}</span>}
    </label>
  )
  const number = (field: 'prisKr' | 'forpackningKg') => (
    <label className="falt">
      <span className="falt-label">{t(`admin.fields.${field}`)}</span>
      <DecimalInput
        value={draft[field]}
        error={error(field)}
        onChange={(v) => set({ [field]: v })}
        onClear={() => set({ [field]: undefined })}
      />
    </label>
  )
  const check = (field: 'iUrval' | 'deklarationKontrollerad' | 'lampligVidFangEms') => (
    <label className="falt kryss">
      <input type="checkbox" checked={draft[field] ?? false} onChange={(e) => set({ [field]: e.target.checked })} />
      <span>{t(`admin.fields.${field}`)}</span>
    </label>
  )
  const dose = (bound: 'min' | 'max') => (
    <label className="falt">
      <span className="falt-label">{t(bound === 'min' ? 'admin.fields.dosMin' : 'admin.fields.dosMax')}</span>
      <DecimalInput
        value={draft.dosGramPer100kg?.[bound]}
        error={error(`dosGramPer100kg.${bound}`)}
        onChange={(v) => set({ dosGramPer100kg: { ...draft.dosGramPer100kg, [bound]: v } })}
        onClear={() => set({ dosGramPer100kg: { ...draft.dosGramPer100kg, [bound]: undefined } })}
      />
    </label>
  )
  const nutrient = (key: NutrientKey) => (
    <label className="falt" key={key}>
      <span className="falt-label">
        {t('admin.fields.nutrient', { name: nutrientLabel(key), unit: NUTRIENTS[key].unit })}
      </span>
      <DecimalInput
        value={draft.perKg[key]}
        error={error(`perKg.${key}`)}
        onChange={(v) => set({ perKg: { ...draft.perKg, [key]: v } })}
        onClear={() => set({ perKg: Object.fromEntries(Object.entries(draft.perKg).filter(([k]) => k !== key)) })}
      />
    </label>
  )

  return (
    <form
      className="admin-produkt"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <p>
        <Link to="/admin/products">{t('admin.back')}</Link>
      </p>
      <div className="kort-rubrikrad">
        <h1>{product ? product.data.namn : t('admin.newTitle')}</h1>
        {product && <span className="liten">{t(product.retired ? 'admin.retired' : 'admin.active')}</span>}
      </div>

      <section className="kort">
        <h2>{t('admin.sections.product')}</h2>
        {text('namn')}
        {text('marke')}
        {text('butik')}
        {text('url')}
        <label className="falt">
          <span className="falt-label">{t('admin.fields.kategori')}</span>
          <select value={draft.kategori} onChange={(e) => set({ kategori: e.target.value as Draft['kategori'] })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`admin.category.${c}`)}
              </option>
            ))}
          </select>
        </label>
        {number('prisKr')}
        {number('forpackningKg')}
        {text('form')}
        <label className="falt">
          <span className="falt-label">{t('admin.fields.ingredienser')}</span>
          <input value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
          <span className="falt-hjalp">{t('admin.fields.ingredienserHint')}</span>
        </label>
      </section>

      <section className="kort">
        <h2>{t('admin.sections.dose')}</h2>
        {dose('min')}
        {dose('max')}
        {text('dosKalla', true)}
        {check('iUrval')}
        {check('lampligVidFangEms')}
      </section>

      <section className="kort">
        <h2>{t('admin.sections.declaration')}</h2>
        <label className="falt">
          <span className="falt-label">{t('admin.fields.naringsdata')}</span>
          <select
            value={draft.naringsdata}
            onChange={(e) => set({ naringsdata: e.target.value as Draft['naringsdata'] })}
          >
            {DECLARATIONS.map((d) => (
              <option key={d} value={d}>
                {t(`admin.declaration.${d}`)}
              </option>
            ))}
          </select>
        </label>
        {NUTRIENT_KEYS.map(nutrient)}
      </section>

      <section className="kort">
        <h2>{t('admin.sections.source')}</h2>
        {text('kalla')}
        <label className="falt">
          <span className="falt-label">{t('admin.fields.insamlad')}</span>
          <input type="date" value={draft.insamlad} onChange={(e) => set({ insamlad: e.target.value })} />
          {error('insamlad') && <span className="falt-fel">{error('insamlad')}</span>}
        </label>
        {check('deklarationKontrollerad')}
        <label className="falt">
          <span className="falt-label">{t('admin.fields.verifiedOn')}</span>
          <input type="date" value={verifiedOn} onChange={(e) => setVerifiedOn(e.target.value)} />
        </label>
        <label className="falt">
          <span className="falt-label">{t('admin.fields.antaganden')}</span>
          <textarea rows={3} value={assumptions} onChange={(e) => setAssumptions(e.target.value)} />
          <span className="falt-hjalp">{t('admin.fields.antagandenHint')}</span>
        </label>
      </section>

      <div className="kort-rubrikrad">
        <button className="knapp" type="submit" disabled={state === 'saving'}>
          {t(state === 'saving' ? 'admin.saving' : 'admin.save')}
        </button>
        {product && (
          <button
            className="knapp sekundar"
            type="button"
            disabled={state === 'saving'}
            onClick={() => void retire(!product.retired)}
          >
            {t(product.retired ? 'admin.restore' : 'admin.retire')}
          </button>
        )}
        <SaveState state={state} />
      </div>
    </form>
  )
}

function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' | 'failed' | 'invalid' }) {
  const { t } = useTranslation()
  if (state === 'failed' || state === 'invalid') {
    return (
      <p className="ruta fel" role="alert">
        {t(state === 'failed' ? 'admin.saveFailed' : 'admin.invalid')}
      </p>
    )
  }
  return <span role="status">{state === 'saved' ? t('admin.saved') : ''}</span>
}

type FieldMessage =
  | 'admin.errors.name'
  | 'admin.errors.required'
  | 'admin.errors.doseBoth'
  | 'admin.errors.doseOrder'
  | 'admin.errors.url'
  | 'admin.fieldInvalid'

/** The field and its message for a refused value, by what is wrong with it: the field is the issue's path. */
function fieldError(path: string[], code: string): [string, FieldMessage] {
  const [field] = path
  if (field === 'dosGramPer100kg') {
    // The schema's own check of the order is on max; a bound not given is a missing value.
    return [
      `dosGramPer100kg.${path[1] ?? 'max'}`,
      code === 'custom' ? 'admin.errors.doseOrder' : 'admin.errors.doseBoth',
    ]
  }
  if (field === 'namn') return [field, 'admin.errors.name']
  if (field === 'url') return [field, 'admin.errors.url']
  if (code === 'invalid_type') return [path.join('.'), 'admin.errors.required']
  return [path.join('.'), 'admin.fieldInvalid']
}
