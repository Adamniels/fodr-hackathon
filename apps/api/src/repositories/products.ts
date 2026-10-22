// The product catalogue (#35, ADR 0008, CF9). Products keep their store IDs; their data lives in immutable versions;
// a set names the versions the optimiser plans with, in the catalogue's order. The import mirrors the generated
// catalogue file (data/products.json): a new product is added, changed data gets a new version, a product the file no
// longer has is retired (and taken back if it returns), and a set is made only when what it would hold changes, so
// importing the same file twice changes nothing. No user is involved: the catalogue is the same for everyone.
import type { Produkt } from '@fodr/domain/types'
import { and, asc, desc, eq, isNull, notInArray, sql } from 'drizzle-orm'
import type { Executor } from '../db'
import { productSetMembers, productSets, productVersions, products } from '../db/schema'

export interface ImportResult {
  added: number
  changed: number
  retired: number
  restored: number
  /** The new set, or null when nothing the optimiser sees changed. */
  setId: string | null
}

export interface ProductRepository {
  importCatalogue(catalogue: Produkt[]): Promise<ImportResult>
  /** The newest set, or null before the first import. */
  currentSetId(): Promise<string | null>
  /** The set's products in the catalogue's order. */
  products(setId: string): Promise<Produkt[]>
}

// JSON with every object's keys sorted, so data read back from jsonb (which reorders keys) compares equal to the file.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )

export function productRepository(db: Executor): ProductRepository {
  return {
    importCatalogue(catalogue) {
      return db.transaction(async (tx) => {
        // One import at a time: two at once would each find the other's products missing.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('products:import'))`)
        const known = await tx.select().from(products)
        const knownById = new Map(known.map((p) => [p.id, p]))
        const latest = await tx
          .selectDistinctOn([productVersions.productId], {
            id: productVersions.id,
            productId: productVersions.productId,
            data: productVersions.data,
          })
          .from(productVersions)
          .orderBy(productVersions.productId, desc(productVersions.createdAt), desc(productVersions.id))
        const latestById = new Map(latest.map((v) => [v.productId, v]))

        const result: ImportResult = { added: 0, changed: 0, retired: 0, restored: 0, setId: null }
        const members: string[] = []
        for (const product of catalogue) {
          const row = knownById.get(product.id)
          if (!row) {
            await tx.insert(products).values({ id: product.id })
            result.added++
          } else if (row.retiredAt) {
            await tx.update(products).set({ retiredAt: null }).where(eq(products.id, product.id))
            result.restored++
          }
          const current = latestById.get(product.id)
          if (current && canonical(current.data) === canonical(product)) {
            members.push(current.id)
            continue
          }
          const [version] = await tx
            .insert(productVersions)
            .values({ productId: product.id, data: product })
            .returning({ id: productVersions.id })
          members.push(version.id)
          if (current) result.changed++
        }
        const inFile = catalogue.map((p) => p.id)
        const retired = await tx
          .update(products)
          .set({ retiredAt: new Date() })
          .where(and(isNull(products.retiredAt), inFile.length > 0 ? notInArray(products.id, inFile) : undefined))
          .returning({ id: products.id })
        result.retired = retired.length

        // A new set only when it would hold other versions, or the same in another order.
        const currentSet = await currentSetIdOf(tx)
        const currentMembers = currentSet ? await memberIds(tx, currentSet) : []
        if (currentMembers.join() !== members.join()) {
          const [set] = await tx.insert(productSets).values({}).returning({ id: productSets.id })
          if (members.length > 0) {
            await tx
              .insert(productSetMembers)
              .values(members.map((productVersionId, position) => ({ setId: set.id, productVersionId, position })))
          }
          result.setId = set.id
        }
        return result
      })
    },

    currentSetId: () => currentSetIdOf(db),

    async products(setId) {
      const rows = await db
        .select({ data: productVersions.data })
        .from(productSetMembers)
        .innerJoin(productVersions, eq(productVersions.id, productSetMembers.productVersionId))
        .where(eq(productSetMembers.setId, setId))
        .orderBy(asc(productSetMembers.position))
      return rows.map((r) => r.data)
    },
  }
}

async function currentSetIdOf(db: Executor): Promise<string | null> {
  const rows = await db
    .select({ id: productSets.id })
    .from(productSets)
    .orderBy(desc(productSets.createdAt), desc(productSets.id))
    .limit(1)
  return rows.at(0)?.id ?? null
}

async function memberIds(db: Executor, setId: string): Promise<string[]> {
  const rows = await db
    .select({ id: productSetMembers.productVersionId })
    .from(productSetMembers)
    .where(eq(productSetMembers.setId, setId))
    .orderBy(asc(productSetMembers.position))
  return rows.map((r) => r.id)
}
