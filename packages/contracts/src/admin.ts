// Product administration (#36, CF9), admins only: every other caller gets 404, so the routes are not seen to exist.
//   GET  /api/v1/admin/products: every product, retired ones too, with its newest version.
//   GET  /api/v1/admin/products/:id: one product.
//   POST /api/v1/admin/products (ProductInputSchema): a new product; its ID is made by the server.
//   PUT  /api/v1/admin/products/:id (ProductInputSchema): a new version of the product.
//   POST /api/v1/admin/products/:id/retire and /restore: takes the product out of the catalogue, or back in.
// Every write makes a new product set, so the catalogue changes at once and a saved plan keeps the set it was computed
// from (ADR 0008). A product an admin has written is never changed by the import again (`editedByAdmin`).
import { z } from 'zod'
import { NUTRIENT_KEYS, type NutrientKey } from '@fodr/domain/nutrients'
import type { Produkt } from '@fodr/domain/types'

const text = (max: number) => z.string().trim().max(max)
const amount = z.number().nonnegative()

const perKg = z
  .object(
    Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, amount.optional()])) as Record<
      NutrientKey,
      z.ZodOptional<typeof amount>
    >,
  )
  .strict()

/** A product as an admin writes it: everything but its ID. */
export const ProductDataSchema = z.object({
  namn: text(200).min(1),
  marke: text(100),
  kategori: z.enum(['mineralfoder', 'tillskott', 'salt', 'kraftfoder', 'proteinfoder', 'ovrigt']),
  perKg,
  prisKr: amount,
  forpackningKg: z.number().positive(),
  dosGramPer100kg: z
    .object({ min: amount, max: amount })
    .refine((d) => d.min <= d.max, { message: 'min is above max', path: ['max'] })
    .optional(),
  dosKalla: text(1000).optional(),
  iUrval: z.boolean(),
  deklarationKontrollerad: z.boolean().optional(),
  lampligVidFangEms: z.boolean(),
  ingredienser: z.array(text(50).min(1)).max(30),
  form: text(50).optional(),
  naringsdata: z.enum(['komplett', 'delvis', 'bara_ravarde', 'saknas', 'ej_relevant']),
  kontrollera: z.array(text(300)).max(30).optional(),
  antaganden: z.array(text(1000)).max(30),
  butik: text(100),
  url: z.url().max(500).optional(),
  kalla: text(500),
  insamlad: z.iso.date(),
})

export const ProductInputSchema = z.object({
  data: ProductDataSchema,
  /** When the data was checked against the package (CF9 "last verified"), or null. */
  verifiedOn: z.iso.date().nullable(),
})

export const AdminProductSchema = z.object({
  id: z.string(),
  data: ProductDataSchema,
  verifiedOn: z.iso.date().nullable(),
  retired: z.boolean(),
  /** An admin has written the product: the import leaves it as it is. */
  editedByAdmin: z.boolean(),
  /** When its newest version was made. */
  updatedAt: z.iso.datetime({ offset: true }),
})

export const AdminProductListSchema = z.object({ products: z.array(AdminProductSchema) })
export const AdminProductResponseSchema = z.object({ product: AdminProductSchema })

export type ProductData = z.infer<typeof ProductDataSchema>
export type ProductInput = z.infer<typeof ProductInputSchema>
export type AdminProduct = z.infer<typeof AdminProductSchema>

// The admin's product is the domain's (ADR 0007): a field added to one and not the other fails to compile.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the generic T is the identity check
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
export type ProductDataMatchesDomain = Assert<Same<ProductData, Omit<Produkt, 'id'>>>
