// Product administration (#36, CF9): /api/v1/admin/products (the contract is in @fodr/contracts/admin), and the test
// error (#43). Admins only: anyone else, signed out or not, gets the same 404 an unknown route gives, so the routes are
// not seen to exist. Every write goes through the product repository, which makes a new product set, so the catalogue
// the API serves and plans with changes on the next request (products.ts).
import { AdminProductSchema, ProductInputSchema, type AdminProduct } from '@fodr/contracts/admin'
import { z } from 'zod'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './app'
import type { Auth } from './auth'
import { problem } from './problem'
import type { AdminProductRow, ProductRepository } from './repositories/products'
import type { UserVariables } from './session'
import { parseJson } from './validation'

// A product with every field filled in is a few KB.
const MAX_BODY_BYTES = 32 * 1024

/** The signed-in admin, or the not-found answer for anyone else. */
function requireAdmin(auth: Auth) {
  return createMiddleware<{ Variables: UserVariables }>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (session?.user.role !== 'admin') return problem(c, 404, 'http.not_found')
    const { id, name, email, emailVerified, termsVersion } = session.user
    c.set('user', { id, name, email, emailVerified, role: 'admin', termsVersion: termsVersion ?? null })
    await next()
  })
}

// Parsed on the way out, so only the contract's fields leave; the product's ID is the row's, not repeated in its data.
const toAdminProduct = ({ data, updatedAt, ...rest }: AdminProductRow): AdminProduct =>
  AdminProductSchema.parse({ ...rest, data, updatedAt: updatedAt.toISOString() })

export function adminRoutes({ auth, products }: { auth: Auth; products: ProductRepository }) {
  const routes = new Hono<AppEnv & { Variables: UserVariables }>()
  routes.use(requireAdmin(auth))
  routes.use(bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => problem(c, 413, 'request.too_large') }))
  const productNotFound = (c: Parameters<typeof problem>[0]) => problem(c, 404, 'product.not_found')

  routes.get('/products', async (c) => c.json({ products: (await products.list()).map(toAdminProduct) }))

  routes.get('/products/:id', async (c) => {
    const product = await products.get(c.req.param('id'))
    return product ? c.json({ product: toAdminProduct(product) }) : productNotFound(c)
  })

  routes.post('/products', async (c) => {
    const body = await parseJson(c, ProductInputSchema)
    if (!body.ok) return body.response
    const product = await products.create(body.data.data, body.data.verifiedOn, c.get('user').id)
    return c.json({ product: toAdminProduct(product) }, 201)
  })

  routes.put('/products/:id', async (c) => {
    const body = await parseJson(c, ProductInputSchema)
    if (!body.ok) return body.response
    const product = await products.update(c.req.param('id'), body.data.data, body.data.verifiedOn, c.get('user').id)
    return product ? c.json({ product: toAdminProduct(product) }) : productNotFound(c)
  })

  for (const [action, retired] of [
    ['retire', true],
    ['restore', false],
  ] as const) {
    routes.post(`/products/:id/${action}`, async (c) => {
      // An empty JSON body, as every write takes JSON: a form another site's page posts is refused (415, ADR 0013).
      const body = await parseJson(c, z.object({}).strict())
      if (!body.ok) return body.response
      const product = await products.setRetired(c.req.param('id'), retired)
      return product ? c.json({ product: toAdminProduct(product) }) : productNotFound(c)
    })
  }

  // The admin's check that error tracking works where it runs (#43): this fails on purpose, so the error is reported to
  // Sentry like any unexpected one, with its request ID. JSON only, like every write (ADR 0013).
  routes.post('/test-error', async (c) => {
    const body = await parseJson(c, z.object({}).strict())
    if (!body.ok) return body.response
    throw new Error('Test error requested by an admin')
  })

  return routes
}
