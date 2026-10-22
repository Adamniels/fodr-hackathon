// The product catalogue in the database (#35, ADR 0008, CF9): the import mirrors the generated catalogue file into
// products, immutable versions and sets of versions; a set changes only when what the optimiser may choose from
// changes, and a saved plan's set keeps resolving to the versions it was computed from. On a database of its own, so
// changing products here never changes the catalogue the other test files plan with.
import type { Produkt } from '@fodr/domain/types'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { recreateDatabase } from '../test/database'
import { createDatabase, type Database } from './db'
import { productSetMembers, productSets, productVersions, products as productRows } from './db/schema'
import { loadCatalogueFile } from './catalogue-file'
import { productRoutes } from './plans-routes'
import { databaseCatalogue } from './products'
import { productRepository, type ProductRepository } from './repositories/products'

const FILE = loadCatalogueFile()
let database: Database
let repository: ProductRepository

beforeAll(async () => {
  const adminUrl = new URL(inject('databaseUrl'))
  adminUrl.pathname = '/fodr'
  database = createDatabase(await recreateDatabase(adminUrl.href, 'fodr_test_products'))
  repository = productRepository(database.db)
})
afterAll(() => database.close())

// Each test starts from an empty catalogue.
beforeEach(async () => {
  // The catalogue's rows refer to each other and are never deleted by the app, so all four go at once.
  await database.db.execute(sql`truncate product_set_members, product_sets, product_versions, products`)
})

const changed = (p: Produkt): Produkt => ({ ...p, prisKr: p.prisKr + 10 })

describe('importing the catalogue', () => {
  it('stores every product with a version, and a set of them in the file order', async () => {
    expect(await repository.currentSetId()).toBeNull()
    const result = await repository.importCatalogue(FILE)
    expect(result).toMatchObject({ added: FILE.length, changed: 0, retired: 0 })
    expect(result.setId).not.toBeNull()
    expect(await repository.currentSetId()).toBe(result.setId)
    // The products as the file lists them, so the optimiser sees the same catalogue in the same order.
    expect(await repository.products(result.setId ?? '')).toEqual(FILE)
  })

  it('changes nothing when imported again unchanged', async () => {
    const first = await repository.importCatalogue(FILE)
    const again = await repository.importCatalogue(FILE)
    expect(again).toEqual({ added: 0, changed: 0, retired: 0, restored: 0, setId: null })
    expect(await repository.currentSetId()).toBe(first.setId)
    expect(await database.db.select().from(productSets)).toHaveLength(1)
  })

  it('gives a changed product a new version, and the catalogue a new set', async () => {
    const first = await repository.importCatalogue(FILE)
    const [head, ...rest] = FILE
    const second = await repository.importCatalogue([changed(head), ...rest])
    expect(second).toMatchObject({ added: 0, changed: 1, retired: 0 })
    expect(second.setId).not.toBe(first.setId)
    expect(await repository.currentSetId()).toBe(second.setId)
    expect((await repository.products(second.setId ?? ''))[0].prisKr).toBe(head.prisKr + 10)
    const versions = await database.db.select().from(productVersions).where(eq(productVersions.productId, head.id))
    expect(versions).toHaveLength(2)
  })

  it('keeps an older set resolving to the versions it had, as a saved plan needs', async () => {
    const first = await repository.importCatalogue(FILE)
    const [head, ...rest] = FILE
    await repository.importCatalogue([changed(head), ...rest])
    expect(await repository.products(first.setId ?? '')).toEqual(FILE)
  })

  it('retires a product the file no longer has, and takes it back when it returns', async () => {
    await repository.importCatalogue(FILE)
    const [head, ...rest] = FILE
    const without = await repository.importCatalogue(rest)
    expect(without).toMatchObject({ retired: 1 })
    expect((await repository.products(without.setId ?? '')).map((p) => p.id)).not.toContain(head.id)
    const [row] = await database.db.select().from(productRows).where(eq(productRows.id, head.id))
    expect(row.retiredAt).not.toBeNull()

    const back = await repository.importCatalogue(FILE)
    expect(back).toMatchObject({ restored: 1, changed: 0 })
    expect(await repository.products(back.setId ?? '')).toEqual(FILE)
  })

  it('makes a new set when only the order changes', async () => {
    const first = await repository.importCatalogue(FILE)
    const reversed = [...FILE].reverse()
    const reordered = await repository.importCatalogue(reversed)
    expect(reordered).toMatchObject({ added: 0, changed: 0 })
    expect(reordered.setId).not.toBeNull()
    expect(reordered.setId).not.toBe(first.setId)
    expect(await repository.products(reordered.setId ?? '')).toEqual(reversed)
  })

  it('reads a set in its order, whatever order the rows are stored in', async () => {
    const { setId } = await repository.importCatalogue(FILE)
    // The member rows written again in reverse, so only the stored position can give the catalogue's order.
    const rows = await database.db
      .delete(productSetMembers)
      .where(eq(productSetMembers.setId, setId ?? ''))
      .returning()
    await database.db.insert(productSetMembers).values(rows.reverse())
    expect(await repository.products(setId ?? '')).toEqual(FILE)
  })

  it('refuses an empty catalogue, and changes nothing', async () => {
    const first = await repository.importCatalogue(FILE)
    await expect(repository.importCatalogue([])).rejects.toThrow('The catalogue file has no products')
    expect(await repository.currentSetId()).toBe(first.setId)
    expect(await repository.products(first.setId ?? '')).toEqual(FILE)
  })

  it('refuses a catalogue with a product twice, naming it, and changes nothing', async () => {
    const [head] = FILE
    await expect(repository.importCatalogue([...FILE, head])).rejects.toThrow(`twice: ${head.id}`)
    expect(await repository.currentSetId()).toBeNull()
  })

  it('stores one set when imported twice at once', async () => {
    await Promise.all([repository.importCatalogue(FILE), repository.importCatalogue(FILE)])
    expect(await database.db.select().from(productSets)).toHaveLength(1)
    expect(await database.db.select().from(productVersions)).toHaveLength(FILE.length)
  })
})

describe('the catalogue the API serves', () => {
  const served = async (app: ReturnType<typeof productRoutes>) => {
    const res = await app.request('/')
    return { etag: res.headers.get('etag'), body: (await res.json()) as { version: string; products: Produkt[] } }
  }

  it('is the newest set, and a new set shows without a restart', async () => {
    const first = await repository.importCatalogue(FILE)
    const app = productRoutes(databaseCatalogue(repository))
    const before = await served(app)
    expect(before.etag).toBe(`"${first.setId ?? ''}"`)
    expect(before.body.products).toEqual(FILE)

    const [head, ...rest] = FILE
    const second = await repository.importCatalogue([changed(head), ...rest])
    const after = await served(app)
    expect(after.etag).toBe(`"${second.setId ?? ''}"`)
    expect(after.body.products[0].prisKr).toBe(head.prisKr + 10)
  })
})
