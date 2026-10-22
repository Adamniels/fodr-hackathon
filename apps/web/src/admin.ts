// Product administration on the API (#36, CF9): /api/v1/admin/products, admins only (the contract is in
// @fodr/contracts/admin). A write changes the catalogue every plan uses, so it drops the cached catalogue too: the
// workspace's previews then plan with the new product set.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AdminProductListSchema,
  AdminProductResponseSchema,
  type AdminProduct,
  type ProductInput,
} from '@fodr/contracts/admin'
import { callApi, sessionGuard } from './api-v1'

/** Every account's admin queries, removed on logout. */
export const ADMIN_QUERY_KEY = ['admin']

const base = '/admin/products'
const send = async (path: string, method: string, body?: unknown) =>
  AdminProductResponseSchema.parse(
    await (await callApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })).json(),
  ).product

export const adminApi = {
  list: async () => AdminProductListSchema.parse(await (await callApi(base)).json()).products,
  get: async (id: string) => AdminProductResponseSchema.parse(await (await callApi(`${base}/${id}`)).json()).product,
  create: (input: ProductInput) => send(base, 'POST', input),
  update: (id: string, input: ProductInput) => send(`${base}/${id}`, 'PUT', input),
  setRetired: (id: string, retired: boolean) => send(`${base}/${id}/${retired ? 'retire' : 'restore'}`, 'POST', {}),
}

export function useAdminProducts(userId: string) {
  const guard = sessionGuard(useQueryClient())
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, userId, 'products'],
    queryFn: () => guard(adminApi.list()),
    retry: false,
  })
}

export function useAdminProduct(userId: string, id: string | undefined) {
  const guard = sessionGuard(useQueryClient())
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, userId, 'product', id ?? ''],
    // enabled only with an ID.
    queryFn: () => guard(adminApi.get(id ?? '')),
    enabled: id !== undefined,
    retry: false,
  })
}

/** The admin's writes: each refreshes the admin lists and the catalogue the workspace plans with. */
export function useAdminWrites() {
  const queryClient = useQueryClient()
  const guard = sessionGuard(queryClient)
  const after = async (product: AdminProduct) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ])
    return product
  }
  return {
    create: async (input: ProductInput) => after(await guard(adminApi.create(input))),
    update: async (id: string, input: ProductInput) => after(await guard(adminApi.update(id, input))),
    setRetired: async (id: string, retired: boolean) => after(await guard(adminApi.setRetired(id, retired))),
  }
}
