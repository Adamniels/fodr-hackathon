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
