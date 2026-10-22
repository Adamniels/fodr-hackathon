// The product catalogue the engine plans with, from the API (#27): the browser previews with it, the server saves
// plans with the same one (ADR 0004). The web app no longer bundles it. Read once per page; the browser revalidates
// it by its version (ETag), so a reload downloads it only when it changed.
import { useQuery } from '@tanstack/react-query'
import { ProductCatalogueSchema, type ProductCatalogue } from '@fodr/contracts/plans'
import { callApi } from './api-v1'

export const fetchCatalogue = async (): Promise<ProductCatalogue> =>
  ProductCatalogueSchema.parse(await (await callApi('/products')).json())

export const useCatalogue = () =>
  useQuery({ queryKey: ['products'], queryFn: fetchCatalogue, staleTime: Infinity, retry: 2 })
