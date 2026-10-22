// The product catalogue (#35, ADR 0008, CF9). Products keep their store IDs; their data lives in immutable versions;
// a set names the versions the optimiser plans with, in the catalogue's order. The import mirrors the generated
// catalogue file (data/products.json): a new product is added, changed data gets a new version, a product the file no
// longer has is retired (and taken back if it returns), and a set is made only when what it would hold changes, so
// importing the same file twice changes nothing. Admins write products too (#36): a product an admin has created,
// edited, retired or restored is theirs from then on, and the import leaves it as it is. Every write, the import's or
// an admin's, takes the same lock, so they never interleave. Admin routes check the role (admin-routes.ts); the
// catalogue is the same for everyone, so nothing here is scoped to a user.
import type { Produkt } from '@fodr/domain/types'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { Executor } from '../db'
import { productSetMembers, productSets, productVersions, products } from '../db/schema'

export interface ImportResult {
  added: number
  changed: number
  retired: number
  restored: number
  /** Products an admin has written, which the import left as they are (#36). */
  kept: number
  /** The new set, or null when nothing the optimiser sees changed. */
  setId: string | null
}

/** A product as the admin view shows it: its newest version. */
export interface AdminProductRow {
  id: string
  data: Produkt
  verifiedOn: string | null
  retired: boolean
  editedByAdmin: boolean
  updatedAt: Date
}

export interface ProductRepository {
  importCatalogue(catalogue: Produkt[]): Promise<ImportResult>
  /** The newest set, or null before the first import. */
  currentSetId(): Promise<string | null>
  /** The set's products in the catalogue's order. */
  products(setId: string): Promise<Produkt[]>
  /** Every product, retired ones too, by name. */
  list(): Promise<AdminProductRow[]>
  get(id: string): Promise<AdminProductRow | undefined>
  /** A new product by the admin, added at the end of the catalogue. */
  create(data: Omit<Produkt, 'id'>, verifiedOn: string | null, adminId: string): Promise<AdminProductRow>
  /** A new version by the admin; undefined for an unknown product. */
  update(
    id: string,
    data: Omit<Produkt, 'id'>,
    verifiedOn: string | null,
    adminId: string,
  ): Promise<AdminProductRow | undefined>
  /** Takes the product out of the catalogue, or back in at its end; undefined for an unknown product. */
  setRetired(id: string, retired: boolean): Promise<AdminProductRow | undefined>
}

// JSON with every object's keys sorted, so data read back from jsonb (which reorders keys) compares equal to the file.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )

// Every write to the catalogue, one at a time: two at once would each build a set from what the other is replacing.
const lockCatalogue = (tx: Executor) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('products:import'))`)

export function productRepository(db: Executor): ProductRepository {
  const newest = (tx: Executor) =>
    tx
      .selectDistinctOn([productVersions.productId], {
        id: productVersions.id,
        productId: productVersions.productId,
        data: productVersions.data,
        verifiedOn: productVersions.verifiedOn,
        createdAt: productVersions.createdAt,
      })
      .from(productVersions)
      .orderBy(productVersions.productId, desc(productVersions.createdAt), desc(productVersions.id))

  async function row(tx: Executor, id: string): Promise<AdminProductRow | undefined> {
    const product = (await tx.select().from(products).where(eq(products.id, id))).at(0)
    if (!product) return undefined
    const [version] = await tx
      .select()
      .from(productVersions)
      .where(eq(productVersions.productId, id))
      .orderBy(desc(productVersions.createdAt), desc(productVersions.id))
      .limit(1)
    return {
      id,
      data: version.data,
      verifiedOn: version.verifiedOn,
      retired: product.retiredAt !== null,
      editedByAdmin: product.adminManagedAt !== null,
      updatedAt: version.createdAt,
    }
  }

  /** A new set from the current one with the product's member replaced (or added at the end), or taken out. */
  async function replaceMember(tx: Executor, productId: string, versionId: string | null) {
    const currentSet = await currentSetIdOf(tx)
    const current = currentSet ? await members(tx, currentSet) : []
    const others = current.filter((m) => m.productId !== productId)
    const at = current.findIndex((m) => m.productId === productId)
    const next = others.map((m) => m.versionId)
    if (versionId !== null) next.splice(at === -1 ? next.length : at, 0, versionId)
    await writeSet(tx, next)
  }

  return {
    importCatalogue(catalogue) {
      // An empty file would retire every product and still leave a set, so the API would start and plan with nothing;
      // a product twice would be stored once and listed twice. Both are a broken file, refused before anything changes.
      if (catalogue.length === 0) return Promise.reject(new Error('The catalogue file has no products'))
      const seen = new Set<string>()
      const twice = [...new Set(catalogue.map((p) => p.id).filter((id) => seen.size === seen.add(id).size))]
      if (twice.length > 0) {
        return Promise.reject(new Error(`The catalogue file lists a product twice: ${twice.join(', ')}`))
      }
      return db.transaction(async (tx) => {
        await lockCatalogue(tx)
        const known = await tx.select().from(products)
        const knownById = new Map(known.map((p) => [p.id, p]))
        const latestById = new Map((await newest(tx)).map((v) => [v.productId, v]))
        const result: ImportResult = { added: 0, changed: 0, retired: 0, restored: 0, kept: 0, setId: null }
        const next: string[] = []
        const inFile = new Set(catalogue.map((p) => p.id))

        for (const product of catalogue) {
          const existing = knownById.get(product.id)
          const current = latestById.get(product.id)
          // An admin's product stays as the admin left it: in the catalogue unless they retired it.
          if (existing?.adminManagedAt) {
            result.kept++
            if (!existing.retiredAt && current) next.push(current.id)
            continue
          }
          if (!existing) {
            await tx.insert(products).values({ id: product.id })
            result.added++
          } else if (existing.retiredAt) {
            await tx.update(products).set({ retiredAt: null }).where(eq(products.id, product.id))
            result.restored++
          }
          if (current && canonical(current.data) === canonical(product)) {
            next.push(current.id)
            continue
          }
          const [version] = await tx
            .insert(productVersions)
            .values({ productId: product.id, data: product })
            .returning({ id: productVersions.id })
          next.push(version.id)
          if (current) result.changed++
        }

        // Products the file no longer has: retired, unless an admin's, which stay where they were.
        const currentSet = await currentSetIdOf(tx)
        const current = currentSet ? await members(tx, currentSet) : []
        for (const product of known) {
          if (inFile.has(product.id)) continue
          if (product.adminManagedAt) {
            result.kept++
            const member = current.find((m) => m.productId === product.id)
            if (member) next.push(member.versionId)
          } else if (!product.retiredAt) {
            await tx
              .update(products)
              .set({ retiredAt: sql`clock_timestamp()` })
              .where(eq(products.id, product.id))
            result.retired++
          }
        }

        // A new set only when it would hold other versions, or the same in another order.
        if (current.map((m) => m.versionId).join() !== next.join()) result.setId = await writeSet(tx, next)
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

    async list() {
      const [all, versions] = await Promise.all([db.select().from(products), newest(db)])
      const byId = new Map(versions.map((v) => [v.productId, v]))
      return all
        .flatMap((p) => {
          const v = byId.get(p.id)
          return v
            ? [
                {
                  id: p.id,
                  data: v.data,
                  verifiedOn: v.verifiedOn,
                  retired: p.retiredAt !== null,
                  editedByAdmin: p.adminManagedAt !== null,
                  updatedAt: v.createdAt,
                },
              ]
            : []
        })
        .sort((a, b) => a.data.namn.localeCompare(b.data.namn, 'sv'))
    },

    get: (id) => row(db, id),

    create(data, verifiedOn, adminId) {
      return db.transaction(async (tx) => {
        await lockCatalogue(tx)
        // Not a store's ID, so it never meets one the import brings.
        const id = `adm-${randomUUID().slice(0, 8)}`
        await tx.insert(products).values({ id, adminManagedAt: sql`clock_timestamp()` })
        const [version] = await tx
          .insert(productVersions)
          .values({ productId: id, data: { id, ...data }, verifiedOn, createdBy: adminId })
          .returning({ id: productVersions.id })
        await replaceMember(tx, id, version.id)
        return (await row(tx, id)) as AdminProductRow
      })
    },

    update(id, data, verifiedOn, adminId) {
      return db.transaction(async (tx) => {
        await lockCatalogue(tx)
        const product = (await tx.select().from(products).where(eq(products.id, id))).at(0)
        if (!product) return undefined
        await tx
          .update(products)
          .set({ adminManagedAt: product.adminManagedAt ?? sql`clock_timestamp()` })
          .where(eq(products.id, id))
        const [version] = await tx
          .insert(productVersions)
          .values({ productId: id, data: { id, ...data }, verifiedOn, createdBy: adminId })
          .returning({ id: productVersions.id })
        // A retired product's new version waits outside the catalogue until it is restored.
        if (!product.retiredAt) await replaceMember(tx, id, version.id)
        return row(tx, id)
      })
    },

    setRetired(id, retired) {
      return db.transaction(async (tx) => {
        await lockCatalogue(tx)
        const product = (await tx.select().from(products).where(eq(products.id, id))).at(0)
        if (!product) return undefined
        await tx
          .update(products)
          .set({
            retiredAt: retired ? (product.retiredAt ?? sql`clock_timestamp()`) : null,
            adminManagedAt: product.adminManagedAt ?? sql`clock_timestamp()`,
          })
          .where(eq(products.id, id))
        const [version] = await tx
          .select({ id: productVersions.id })
          .from(productVersions)
          .where(eq(productVersions.productId, id))
          .orderBy(desc(productVersions.createdAt), desc(productVersions.id))
          .limit(1)
        await replaceMember(tx, id, retired ? null : version.id)
        return row(tx, id)
      })
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

async function members(db: Executor, setId: string): Promise<{ versionId: string; productId: string }[]> {
  return db
    .select({ versionId: productSetMembers.productVersionId, productId: productVersions.productId })
    .from(productSetMembers)
    .innerJoin(productVersions, eq(productVersions.id, productSetMembers.productVersionId))
    .where(eq(productSetMembers.setId, setId))
    .orderBy(asc(productSetMembers.position))
}

async function writeSet(tx: Executor, versionIds: string[]): Promise<string> {
  const [set] = await tx.insert(productSets).values({}).returning({ id: productSets.id })
  if (versionIds.length > 0) {
    await tx
      .insert(productSetMembers)
      .values(versionIds.map((productVersionId, position) => ({ setId: set.id, productVersionId, position })))
  }
  return set.id
}
