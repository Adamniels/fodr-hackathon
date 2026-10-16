# 0010. Authorization through a repository layer

Status: Accepted. Date: 2026-10-16.

## Context

A user must never read or change another user's data (CF1). A single forgotten `WHERE user_id = ...` in a handler would leak horse health data.

## Decision

Handlers never query tables directly. All data access goes through **repositories** in `apps/api` that take the authenticated user as a required argument and scope every query through `horse_members` (for example `horses.listFor(user)`, `analyses.create(user, horseId, ...)`). A resource the user may not access is reported as **404 Not Found**, not 403, so IDs cannot be probed.

Every repository has **integration tests against real Postgres** (ADR 0006) that create two users and assert that user B can neither read nor change user A's data.

## Alternatives

- **Postgres Row Level Security.** A strong second line of defence, but policies are harder to test and review than TypeScript, and need a database role per request. Can be added later on top of this.
- **Checks in each handler.** Easy to forget; exactly the failure this ADR prevents.

## Consequences

- One place to review for access rules.
- A lint rule forbids importing the Drizzle database object outside the repository folder.
- When sharing arrives, roles in `horse_members` extend the repositories without touching handlers.
