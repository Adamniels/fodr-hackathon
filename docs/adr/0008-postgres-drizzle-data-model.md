# 0008. Postgres with Drizzle, and the data model

Status: Accepted. Date: 2026-10-16.

## Context

State lives in localStorage today, the analysis is not stored at all, IDs come from `Date.now()`, and plans are not reproducible (audit section 4). The spec requires analyses per horse with the original file, reproducible plans, versioned products, AI usage quotas, and a model that allows a horse to get more users later (spec 6.3).

## Decision

**Database and access.** Postgres. Schema, queries and migrations with **Drizzle ORM** (0.45.x) and **drizzle-kit** (0.31.x). Migrations are generated, reviewed in PRs and applied explicitly; never `push` against a shared database. IDs are server generated UUIDs.

**Model.** Identity, ownership and anything we filter on are columns; nutrient value maps and AI raw output are `jsonb`, validated by the zod schemas from `packages/contracts` on write and read.

```
users, sessions, accounts, verifications     owned by Better Auth (ADR 0009)
horses            id, name, profile jsonb, created_at, updated_at, deleted_at
horse_members     horse_id, user_id, role ('owner' only for now)       -- sharing later without migration
analyses          id, horse_id, file_key, media_type, values jsonb, extracted jsonb,
                  is_current, sampled_on, created_at
products          id, retired_at                                        -- stable identity
product_versions  id, product_id, data jsonb, verified_on, created_at   -- immutable rows
plans             id, horse_id, analysis_id, inputs jsonb, result jsonb,
                  engine_version, product_set_version, created_at       -- immutable
journal_entries   id, horse_id, date, weight_kg, body_condition, text, plan_id, created_at
ai_usage          id, user_id, route, model, input_tokens, output_tokens, cost_sek, created_at
```

A **product set version** names the exact set of `product_versions` the optimiser saw; a plan stores it, so editing a product never changes a saved plan (CF5, CF9).

## Alternatives

- **Kysely.** Excellent typed query builder, but no schema definition or migration generation of its own, and no Better Auth adapter.
- **Prisma.** Mature, but a heavier toolchain with generated client code.
- **Everything as columns.** Nutrient maps are wide (21 keys), always read whole, and change with SLU data; columns would add churn without query benefit.

## Consequences

- Drizzle is still 0.x: pin exact versions and read release notes on upgrades.
- jsonb data is only as safe as its zod schema; contracts and migrations must change together.
- Account deletion (CF8) deletes horses through `horse_members` ownership, plus files in object storage.

## Notes

- 2026-10-21 (#24): `horses` (id, name, profile jsonb, created_at, updated_at) and `horse_members` (horse_id, user_id, role `'owner'`). Deleting a horse is a hard delete that cascades to everything referencing it; there is no `deleted_at` (owner). The profile is validated for shape and types only: an out-of-range value saves as a draft and the engine refuses to plan with it (owner). Deleting a user cascades to the membership, not the horse, so account deletion (CF8) must delete the user's horses through ownership, as the Consequences say.
- 2026-10-22 (#26): `analyses` as above, without `deleted_at`: `file_key` and `media_type` are null for an analysis without a file (the seed's, #29, and one typed in by hand), `values` holds the converted analysis with its SLU conversions (`{ analys, omrakningar }`), and `extracted` the AI's reading as it came. The newest analysis is current; a partial unique index allows one current analysis per horse. Rows cascade with the horse, and the horse routes delete the files (ADR 0011).
- 2026-10-22 (#27): `plans` as above, without a separate profile column: `inputs` holds the profile and the analysis values the plan was computed from, `result` the plan, `engine_version` the build's git commit (`APP_VERSION`, set by the image) and `product_set_version` a hash of the catalogue the API serves, until product tables arrive (#35). A plan is never updated; it cascades with its horse and its analysis.
- 2026-10-22 (#28): `journal_entries` as above, with `weight_kg` as a double and `body_condition` an integer, both null when not measured. An entry made by saving a plan has its `plan_id`, and its snapshot is derived from the plan when read rather than stored twice; such an entry and its plan are written in one transaction. `created_at` orders entries on the same date. An entry that updates the profile writes the horse in the same transaction. Two consequences to keep: the snapshot is computed with today's `ogonblickAvPlan` over a stored `result`, so that function must keep reading every stored plan's shape (each names its `engine_version`); and the cascade runs analysis → plan → entry, so a future way to delete an analysis must decide what happens to the journal entries of its plans before it deletes them.
- 2026-10-22 (#31): `ai_usage` as above, plus `status` (`pending`, `ok`, `failed`): a call reserves its row as pending before it is sent, and the quota counts every row of the day. `cost_sek` is numeric(12,4). Rows cascade with the user.

- 2026-10-22 (#32): `plan_explanations` (plan_id primary key, text, model, created_at): a saved plan's AI explanation, apart from `plans` so a plan stays immutable. Regenerating replaces the row, and `created_at` is when the current text was written. It cascades with its plan. `plans.created_at` defaults to `clock_timestamp()` since then, as the newest plan decides whether a save is stored again.

- 2026-10-22 (#35): the product tables as above, plus `product_sets` and `product_set_members` (set_id, product_version_id, position): a set is immutable and lists its versions in the catalogue's order, which the optimiser reads them in. `products.id` keeps the stores' IDs, which horse profiles refer to; `products.created_at` is the only other column. A plan's `product_set_version` is the set's ID (before #35 it was a hash of the catalogue file, which is why the column has no foreign key to `product_sets`). A set's positions are unique. The import (`npm run products:import`) mirrors the generated `apps/api/src/data/products.json`: a new product is added, changed data gets a new version, a product the file no longer has is retired, and a set is made only when its versions or their order change. Once admins edit products in the database (#36), re-running the import from the file would give those products new versions from the file and undo the edits: #36 decides whether the import then stops, or only adds products.

- 2026-10-22 (#36): admins write products (CF9). `product_versions.created_by` names the admin who made a version (null for the import, set null when the account goes); `products.admin_managed_at` is set by an admin's first create, edit, retire or restore, and from then on the import leaves the product as the admin left it, in the catalogue unless they retired it (the import reports it as kept). Every admin write takes the import's lock and makes a new set from the current one, the product's member replaced, added at the end or taken out. The optimiser chooses only products whose `deklarationKontrollerad` is true (with `iUrval` and a dose range): the generator sets it for the products `produktval.json` makes selectable, and #37 confirms each against the package.

- 2026-10-22 (#41): `ai_usage.user_id` is nullable with `ON DELETE SET NULL`: a deleted account's AI usage stays as anonymous cost history (decided in #31). Deleting an account deletes the user's horses first, through ownership, so their analyses, plans, explanations and journal go with them, then the user row, which takes the sessions, the login and the memberships.
